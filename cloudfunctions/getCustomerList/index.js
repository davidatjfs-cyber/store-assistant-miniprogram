const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const { keyword } = event
    let query = {}
    if (keyword) {
      query.phone = db.RegExp({ regexp: keyword, options: 'i' })
    }

    // 获取用户列表
    const usersRes = await db.collection('users')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(100)
      .get()

    // 统计数据
    const totalRes = await db.collection('users').count()
    
    // 获取用户标签统计
    const tagsRes = await db.collection('user_tags').get()
    const vipSet = new Set()
    tagsRes.data.forEach(t => {
      if (t.tags && t.tags.includes('vip')) vipSet.add(t.user_id)
    })

    // 获取每个用户的券数量
    const vouchersRes = await db.collection('user_vouchers').get()
    const voucherCountMap = {}
    vouchersRes.data.forEach(v => {
      voucherCountMap[v.user_id] = (voucherCountMap[v.user_id] || 0) + 1
    })

    const customers = usersRes.data.map(u => {
      const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '—'
      const lastVisit = u.last_visit ? new Date(u.last_visit).toLocaleDateString('zh-CN') : '—'
      return {
        _id: u._id,
        phone: u.phone ? u.phone.slice(0,3) + '****' + u.phone.slice(-4) : '',
        user_level: u.user_level || 'new',
        totalOrders: u.total_orders || 0,
        totalSpent: u.total_spent || 0,
        voucherCount: voucherCountMap[u._id] || 0,
        joinDate: joinDate,
        lastVisit: lastVisit
      }
    })

    return {
      success: true,
      data: customers,
      stats: {
        totalUsers: totalRes.total,
        vipUsers: vipSet.size,
        newUsers: usersRes.data.filter(u => u.user_level === 'new').length
      }
    }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
