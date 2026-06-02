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

// 标签中文名（与 HRMS / getRecentArrivals 一致）
const TAG_LABEL_MAP = {
  vip: 'VIP',
  frequent: '常客',
  inactive: '未活跃',
  new: '新客',
  high_value: '高价值',
  low_value: '低价值',
  general: '普通'
}
function tagLabel(t) {
  return TAG_LABEL_MAP[String(t)] || String(t)
}

// 聚合标签：user_tags 集合 + users.tags 字段
async function buildTagMap() {
  const map = {}
  try {
    const r = await db.collection('user_tags').limit(1000).get()
    r.data.forEach(row => {
      if (!row.user_id || !row.tag) return
      const k = row.user_id
      ;(map[k] = map[k] || new Set()).add(String(row.tag))
    })
  } catch (e) {}
  return map
}
function tagsForUser(u, tagMap) {
  const set = tagMap[u._id] ? new Set(tagMap[u._id]) : new Set()
  if (Array.isArray(u.tags)) u.tags.forEach(t => t && set.add(String(t)))
  return Array.from(set)
}

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

    const tagMap = await buildTagMap()

    // 客户管理只展示已授权手机号的真实会员；未授权（phone 为空）的扫码访客不计入
    const scopedUsers = usersRes.data
      .filter(u => u.phone && String(u.phone).trim())
      .filter(u => !belongs || belongs(u))

    // 当前门店范围内出现过的全部标签（供前端做筛选 chips）
    const availableTagSet = new Set()
    scopedUsers.forEach(u => tagsForUser(u, tagMap).forEach(t => availableTagSet.add(t)))
    const availableTags = Array.from(availableTagSet).map(t => ({ key: t, label: tagLabel(t) }))

    // 标签筛选
    const tagFilter = tag ? String(tag).trim() : ''
    const finalUsers = tagFilter
      ? scopedUsers.filter(u => tagsForUser(u, tagMap).indexOf(tagFilter) >= 0)
      : scopedUsers

    const customers = finalUsers.map(u => {
      const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '—'
      const lastVisit = u.last_visit ? new Date(u.last_visit).toLocaleDateString('zh-CN') : '—'
      const lifecycleStage = normalizeLifecycleStage(u.lifecycle_stage || u.user_level)
      const tags = tagsForUser(u, tagMap)
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
        lastVisit: lastVisit,
        tags: tags,
        tagLabels: tags.map(tagLabel)
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
