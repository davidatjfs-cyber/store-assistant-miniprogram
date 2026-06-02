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

// 客户分类标签 = HRMS 生命周期阶段（与 HRMS / getRecentArrivals 100% 一致）
// 仅这 6 个分类，不含价值分层(vip/regular/low)等其它维度
const LIFECYCLE_ORDER = ['prospect', 'new', 'active', 'at_risk', 'dormant', 'churned']

// 综合口径：在该店“消费 / 到店 / 领券”任一发生即算该店客户
async function buildStoreMembership(storeId) {
  const sid = String(storeId)
  const idSet = new Set()       // 命中 users._id（券、到店）
  const openidSet = new Set()   // 命中 openid（消费订单）

  const [vRes, aRes, oRes] = await Promise.all([
    db.collection('user_vouchers').where({ store_id: sid }).limit(1000).get().catch(() => ({ data: [] })),
    db.collection('user_arrival_logs').where({ store_id: sid }).limit(1000).get().catch(() => ({ data: [] })),
    db.collection('Orders').where({ store_id: sid, payment_status: 'paid' }).limit(1000).get().catch(() => ({ data: [] }))
  ])

  vRes.data.forEach(v => { if (v.user_id) idSet.add(v.user_id) })
  aRes.data.forEach(a => { if (a.user_id) idSet.add(a.user_id) })
  oRes.data.forEach(o => { const oid = o._openid || o.openid; if (oid) openidSet.add(oid) })

  return function belongs(u) {
    return idSet.has(u._id) || openidSet.has(u.openid) || openidSet.has(u._openid)
  }
}

exports.main = async (event, context) => {
  try {
    const { keyword, store_id, tag } = event
    let query = {}
    if (keyword) {
      query.phone = db.RegExp({ regexp: keyword, options: 'i' })
    }

    const usersRes = await db.collection('users')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(500)
      .get()

    // 门店归属判定（综合口径）
    let belongs = null
    if (store_id) {
      belongs = await buildStoreMembership(store_id)
    }

    const vouchersRes2 = await db.collection('user_vouchers').limit(1000).get()
    const voucherCountMap = {}
    vouchersRes2.data.forEach(v => {
      voucherCountMap[v.user_id] = (voucherCountMap[v.user_id] || 0) + 1
    })

    // 客户管理只展示已授权手机号的真实会员；未授权（phone 为空）的扫码访客不计入
    const scopedUsers = usersRes.data
      .filter(u => u.phone && String(u.phone).trim())
      .filter(u => !belongs || belongs(u))

    // 每位客户的分类 = 当前 HRMS 生命周期阶段（单一、与 HRMS 一致）
    const stageOf = u => normalizeLifecycleStage(u.lifecycle_stage || u.user_level)

    // 当前范围内出现过的生命周期分类（供前端筛选 chips，按 HRMS 固定顺序）
    const presentStages = new Set(scopedUsers.map(stageOf))
    const availableTags = LIFECYCLE_ORDER
      .filter(s => presentStages.has(s))
      .map(s => ({ key: s, label: lifecycleLabel(s) }))

    // 标签筛选：按生命周期阶段精确匹配
    const tagFilter = tag ? String(tag).trim() : ''
    const finalUsers = tagFilter
      ? scopedUsers.filter(u => stageOf(u) === tagFilter)
      : scopedUsers

    const customers = finalUsers.map(u => {
      const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '—'
      const lastVisit = u.last_visit ? new Date(u.last_visit).toLocaleDateString('zh-CN') : '—'
      const lifecycleStage = stageOf(u)
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

    // 统计：选了门店或标签则按当前结果统计；否则全局
    let totalUsers
    if (store_id || tagFilter) {
      totalUsers = finalUsers.length
    } else {
      const totalRes = await db.collection('users').count()
      totalUsers = totalRes.total
    }

    return {
      success: true,
      data: customers,
      availableTags: availableTags,
      stats: {
        totalUsers: totalUsers,
        vipUsers: finalUsers.filter(u => u.value_tier === 'vip').length,
        newUsers: finalUsers.filter(u => normalizeLifecycleStage(u.lifecycle_stage || u.user_level) === 'new').length
      }
    }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
