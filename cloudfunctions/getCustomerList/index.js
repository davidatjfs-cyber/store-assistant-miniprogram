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
const LIFECYCLE_ORDER = ['prospect', 'new', 'active', 'at_risk', 'dormant', 'churned']

// 分页全量取数（突破单次 get 最多 1000 条的限制）。统计口径必须基于全量，
// 否则像门店会员数会被 500/1000 的硬上限严重低估（曾出现马己仙真实4621却只显示2）。
async function fetchAll(coll, where, fields) {
  const out = []
  const PAGE = 1000
  for (let skip = 0; skip < 200000; skip += PAGE) {
    let q = db.collection(coll).where(where || {})
    if (fields) q = q.field(fields)
    const r = await q.skip(skip).limit(PAGE).get().catch(() => ({ data: [] }))
    out.push(...r.data)
    if (r.data.length < PAGE) break
  }
  return out
}

// 综合口径：在该店“消费 / 到店 / 领券”任一发生即算该店客户（全量分页，不设上限）
async function buildStoreMembership(storeId) {
  const sid = String(storeId)
  const [vs, as, os] = await Promise.all([
    fetchAll('user_vouchers', { store_id: sid }, { user_id: true }),
    fetchAll('user_arrival_logs', { store_id: sid }, { user_id: true }),
    fetchAll('Orders', { store_id: sid, payment_status: 'paid' }, { _openid: true, openid: true })
  ])
  const idSet = new Set()
  const openidSet = new Set()
  vs.forEach(v => { if (v.user_id) idSet.add(v.user_id) })
  as.forEach(a => { if (a.user_id) idSet.add(a.user_id) })
  os.forEach(o => { const oid = o._openid || o.openid; if (oid) openidSet.add(oid) })
  return function belongs(u) {
    return idSet.has(u._id) || openidSet.has(u.openid) || openidSet.has(u._openid)
  }
}

// 北京时间（UTC+8）当月起始对应的绝对 UTC 毫秒
function beijingMonthStartMs() {
  const nowBJ = new Date(Date.now() + 8 * 3600 * 1000)
  const y = nowBJ.getUTCFullYear()
  const m = nowBJ.getUTCMonth()
  return Date.UTC(y, m, 1) - 8 * 3600 * 1000
}

// 'YYYY-MM-DD'（北京时间）转为绝对 UTC 毫秒；endOfDay=true 取当日 23:59:59.999
function beijingDateToMs(dateStr, endOfDay) {
  const parts = String(dateStr).split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  let ms = Date.UTC(parts[0], parts[1] - 1, parts[2]) - 8 * 3600 * 1000
  if (endOfDay) ms += 24 * 3600 * 1000 - 1
  return ms
}

function createdAtMs(u) {
  if (!u.created_at) return NaN
  const t = new Date(u.created_at).getTime()
  return isNaN(t) ? NaN : t
}

// 列表展示上限（统计口径用全量长度，但回传前端的明细做截断，避免响应体过大）
const LIST_DISPLAY_LIMIT = 500

exports.main = async (event, context) => {
  try {
    const { keyword, store_id, tag, start_date, end_date } = event

    // 全量拉取用户（仅必要字段），统计与门店归属都基于全量，杜绝 500 上限低估
    const allUsers = await fetchAll('users', {}, {
      _id: true, openid: true, _openid: true, phone: true,
      lifecycle_stage: true, user_level: true, value_tier: true,
      created_at: true, total_orders: true, total_spent: true, last_visit: true
    })

    // 客户管理只统计已授权手机号的真实会员；未授权（phone 为空）的扫码访客不计入
    let phoneUsers = allUsers.filter(u => u.phone && String(u.phone).trim())

    // 关键词（手机号）筛选
    const kw = keyword ? String(keyword).trim() : ''
    if (kw) phoneUsers = phoneUsers.filter(u => String(u.phone || '').indexOf(kw) >= 0)

    // 门店归属判定（综合口径，全量分页）
    let scopedUsers = phoneUsers
    if (store_id) {
      const belongs = await buildStoreMembership(store_id)
      scopedUsers = phoneUsers.filter(belongs)
    }

    // 每位客户的分类 = 当前 HRMS 生命周期阶段
    const stageOf = u => normalizeLifecycleStage(u.lifecycle_stage || u.user_level)

    // 当前范围内出现过的生命周期分类（供前端筛选 chips）
    const presentStages = new Set(scopedUsers.map(stageOf))
    const availableTags = LIFECYCLE_ORDER
      .filter(s => presentStages.has(s))
      .map(s => ({ key: s, label: lifecycleLabel(s) }))

    // 标签筛选
    const tagFilter = tag ? String(tag).trim() : ''
    const tagFilteredUsers = tagFilter
      ? scopedUsers.filter(u => stageOf(u) === tagFilter)
      : scopedUsers

    // 自定义日期范围（按 created_at / 入会时间过滤，北京时间）
    const rangeStart = start_date ? beijingDateToMs(start_date, false) : null
    const rangeEnd = end_date ? beijingDateToMs(end_date, true) : null
    const hasRange = rangeStart !== null || rangeEnd !== null
    const inRange = u => {
      const t = createdAtMs(u)
      if (isNaN(t)) return false
      if (rangeStart !== null && t < rangeStart) return false
      if (rangeEnd !== null && t > rangeEnd) return false
      return true
    }
    const finalUsers = hasRange ? tagFilteredUsers.filter(inRange) : tagFilteredUsers

    // 本月新增：按 created_at 落在当前北京自然月统计（基于全量范围，不再受 500 上限影响）
    const monthStart = beijingMonthStartMs()
    const newUsersCount = hasRange
      ? finalUsers.length
      : scopedUsers.filter(u => {
          const t = createdAtMs(u)
          return !isNaN(t) && t >= monthStart
        }).length

    // 统计口径：总会员数 / VIP 数均基于当前范围全量
    const totalUsers = finalUsers.length
    const vipUsers = finalUsers.filter(u => (u.value_tier || '') === 'vip').length

    // 展示明细：按入会时间倒序，截断到展示上限（统计已基于全量，明细仅供浏览）
    const sortedForDisplay = finalUsers
      .slice()
      .sort((a, b) => (createdAtMs(b) || 0) - (createdAtMs(a) || 0))
      .slice(0, LIST_DISPLAY_LIMIT)

    // 券数量：仅对展示明细涉及的用户取数，避免全量券表分页开销
    const displayIds = sortedForDisplay.map(u => u._id)
    const voucherCountMap = {}
    for (let i = 0; i < displayIds.length; i += 100) {
      const batch = displayIds.slice(i, i + 100)
      const vr = await db.collection('user_vouchers')
        .where({ user_id: _.in(batch) })
        .field({ user_id: true })
        .limit(1000)
        .get()
        .catch(() => ({ data: [] }))
      vr.data.forEach(v => { voucherCountMap[v.user_id] = (voucherCountMap[v.user_id] || 0) + 1 })
    }

    const customers = sortedForDisplay.map(u => {
      const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '—'
      const lastVisit = u.last_visit ? new Date(u.last_visit).toLocaleDateString('zh-CN') : '—'
      const lifecycleStage = stageOf(u)
      return {
        _id: u._id,
        phone: u.phone ? u.phone.slice(0, 3) + '****' + u.phone.slice(-4) : '',
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
      availableTags: availableTags,
      dateRange: hasRange ? { start_date: start_date || '', end_date: end_date || '' } : null,
      displayLimited: finalUsers.length > customers.length,
      stats: {
        totalUsers: totalUsers,
        vipUsers: vipUsers,
        newUsers: newUsersCount,
        newUsersLabel: hasRange ? '区间新增' : '本月新增'
      }
    }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
