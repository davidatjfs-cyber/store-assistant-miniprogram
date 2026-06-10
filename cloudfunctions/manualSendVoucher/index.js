// 云函数：手动发券（用于企微员工给客户发券）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { phone, templateId, store_id, user_id } = event
  const { OPENID } = cloud.getWXContext()

  try {
    // 1. 权限校验：发券为管理员专属能力（客户管理页虽对全体员工开放以维护客人姓名/性别，
    //    但发券入口仅管理员可见，后端在此同样收紧为 admin-only，双重保险防越权调用）。
    const staffRes = await db.collection('staff').where({ openid: OPENID, active: true }).limit(1).get()
    if (staffRes.data.length === 0) return { success: false, msg: '无权限操作' }
    const staffRow = staffRes.data[0]
    const role = (staffRow.role || 'staff').toLowerCase()
    if (role !== 'admin') {
      return { success: false, msg: '仅管理员可发券' }
    }

    // 2. 确定门店：优先用员工绑定门店，其次用传入的 store_id
    const staffStoreId = String(staffRow.store_id || staffRow.storeId || '').trim()
    const effectiveStoreId = staffStoreId || (store_id ? String(store_id).trim() : '')

    // 3. 查找用户：优先按 user_id（批量发券，避免回传完整手机号），否则按手机号
    let user = null
    if (user_id) {
      const byId = await db.collection('users').doc(String(user_id)).get().catch(() => null)
      if (byId && byId.data) user = byId.data
      if (!user) return { success: false, msg: '用户不存在（user_id 无效）' }
    } else {
      // 清洗手机号（去除空格、横杠等）
      const cleanPhone = String(phone || '').replace(/[\s\-]/g, '')
      if (!cleanPhone || cleanPhone.length < 7) return { success: false, msg: '手机号格式不正确' }

      // 精确匹配
      let userRes = await db.collection('users').where({ phone: cleanPhone }).get()

      // 如果精确匹配失败，尝试模糊匹配（兼容带区号或空格的旧数据）
      if (userRes.data.length === 0) {
        const _ = db.command
        userRes = await db.collection('users').where({
          phone: _.regex({ regexp: cleanPhone.slice(-4), options: 'i' })
        }).get()
        userRes.data = userRes.data.filter(u => u.phone && u.phone.replace(/[\s\-]/g, '') === cleanPhone)
      }

      if (userRes.data.length === 0) {
        return {
          success: false,
          msg: '用户不存在。请确认该手机号已在小程序授权过，或引导用户先扫码绑定。'
        }
      }
      user = userRes.data[0]
    }
    
    // 4. 查找模板
    const tplRes = await db.collection('voucher_templates').doc(templateId).get()
    if (!tplRes.data) return { success: false, msg: '券模板不存在' }
    const tpl = tplRes.data
    
    // 5. 检查库存
    if (tpl.stock !== -1 && tpl.stock <= 0) return { success: false, msg: '库存不足' }

    // 5.5 检查券模板是否适用于当前门店
    if (effectiveStoreId && Array.isArray(tpl.store_ids) && tpl.store_ids.length > 0) {
      if (tpl.store_ids.indexOf(effectiveStoreId) < 0 && tpl.store_ids.indexOf('*') < 0) {
        return { success: false, msg: '该券不可在本门店使用' }
      }
    }

    // 6. 发券
    const voucherId = `mv_${Date.now()}_${Math.floor(Math.random()*1000)}`
    await db.collection('user_vouchers').add({
      data: {
        _id: voucherId,
        user_id: user._id,
        template_id: templateId,
        store_id: effectiveStoreId || (Array.isArray(tpl.store_ids) ? tpl.store_ids[0] : ''),
        status: 'unused',
        qr_code: `voucher:${voucherId}`,
        created_at: db.serverDate(),
        expire_at: new Date(Date.now() + tpl.valid_days * 86400000),
        source: 'manual_send'
      }
    })

    // 7. 扣减库存
    if (tpl.stock !== -1) {
      await db.collection('voucher_templates').doc(templateId).update({
        data: { stock: db.command.inc(-1), sold_count: db.command.inc(1) }
      })
    }

    return { success: true, msg: `发券成功！已发送至 ${user.phone || '用户账户'}` }
  } catch (err) {
    console.error('manualSendVoucher error:', err)
    return { success: false, msg: '系统异常: ' + err.message }
  }
}