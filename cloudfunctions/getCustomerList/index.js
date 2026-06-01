const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function lifecycleLabel(stage) {
  const map = {
    prospect: '潜在新客',
    new: '新客',
    active: '活跃客',
    at_risk: '临界客',
    dormant: '沉睡老客',
    churned: '流失客'
  }
  return map[stage] || map.prospect
}

function normalizeLifecycleStage(stage) {
  const s = String(stage || '').trim()
  if (['prospect', 'new', 'active', 'at_risk', 'dormant', 'churned'].includes(s)) return s
  if (s === 'regular' || s === 'vip') return 'active'
  return 'prospect'
}

exports.main = async (event, context) => {
  try {
    const { keyword, store_id } = event
    let query = {}
    if (keyword) {
      query.phone = db.RegExp({ regexp: keyword, options: 'i' })
    }

    const usersRes = await db.collection('users')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(100)
      .get()

    // If store_id provided, filter to users who have vouchers at this store
    let userIdsInStore = null
    if (store_id) {
      const vouchersRes = await db.collection('user_vouchers')
        .where({ store_id: store_id })
        .limit(1000)
        .get()
      userIdsInStore = new Set(vouchersRes.data.map(v => v.user_id))
    }

    const totalRes = await db.collection('users').count()
    
    const vouchersRes2 = await db.collection('user_vouchers').get()
    const voucherCountMap = {}
    vouchersRes2.data.forEach(v => {
      voucherCountMap[v.user_id] = (voucherCountMap[v.user_id] || 0) + 1
    })

    const customers = usersRes.data
      .filter(u => !userIdsInStore || userIdsInStore.has(u._id))
      .map(u => {
      const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '—'
      const lastVisit = u.last_visit ? new Date(u.last_visit).toLocaleDateString('zh-CN') : '—'
      const lifecycleStage = normalizeLifecycleStage(u.lifecycle_stage || u.user_level)
      return {
        _id: u._id,
        phone: u.phone ? u.phone.slice(0,3) + '****' + u.phone.slice(-4) : '',
        user_level: lifecycleStage,
        user_level_label: lifecycleLabel(lifecycleStage),
        value_tier: u.value_tier || '',
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
        vipUsers: usersRes.data.filter(u => u.value_tier === 'vip').length,
        newUsers: usersRes.data.filter(u => normalizeLifecycleStage(u.lifecycle_stage || u.user_level) === 'new').length
      }
    }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
