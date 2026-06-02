/**
 * 用户数据清理 / 诊断（安全版）
 *
 * 默认 dry-run：只统计、只报告，不改任何数据。
 *   wx.cloud.callFunction({ name: 'cleanupUsers' })
 *
 * 真正执行（按手机号合并重复 + 删除无手机号空记录）：
 *   wx.cloud.callFunction({ name: 'cleanupUsers', data: { confirm: 'CONFIRM_CLEANUP' } })
 *
 * 可选参数：
 *   deleteNoPhone: false   // 不删除无手机号记录（默认删除）
 *
 * 合并规则：同一手机号多条 → 保留“数据最全”的一条（有 openid 字段 > 订单多 > 消费多），
 *   把其余重复条的 user_vouchers / user_arrival_logs / user_tags 引用改指到保留条后删除；
 *   保留条的 total_orders / total_spent 取各条最大值，tags 取并集。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function num(v) {
  return parseInt(v, 10) || 0;
}

function hasPhone(u) {
  return !!(u.phone && String(u.phone).trim());
}

function score(u) {
  let s = 0;
  if (u.openid) s += 1000000000;
  s += num(u.total_orders) * 100000;
  s += num(u.total_spent);
  return s;
}

async function repoint(collection, dupId, keeperId) {
  try {
    const res = await db.collection(collection).where({ user_id: dupId }).limit(1000).get();
    // 并行更新，避免逐条 await 拖慢导致云函数超时
    await Promise.all(res.data.map(d =>
      db.collection(collection).doc(d._id).update({ data: { user_id: keeperId } })
    ));
    return res.data.length;
  } catch (e) {
    // 集合可能不存在，忽略
    return 0;
  }
}

exports.main = async (event) => {
  event = event || {};
  const dryRun = event.confirm !== 'CONFIRM_CLEANUP';
  const deleteNoPhone = event.deleteNoPhone !== false; // 默认 true

  const usersRes = await db.collection('users').limit(1000).get();
  const users = usersRes.data;

  const noPhone = users.filter((u) => !hasPhone(u));
  const withPhone = users.filter(hasPhone);

  const groups = {};
  withPhone.forEach((u) => {
    const p = String(u.phone).trim();
    (groups[p] = groups[p] || []).push(u);
  });

  const dupPhones = Object.keys(groups).filter((p) => groups[p].length > 1);

  const report = {
    dryRun,
    totalUsers: users.length,
    withPhone: withPhone.length,
    noPhone: noPhone.length,
    uniquePhones: Object.keys(groups).length,
    duplicatePhoneGroups: dupPhones.length,
    duplicateExtraRecords: dupPhones.reduce((n, p) => n + (groups[p].length - 1), 0),
    willDeleteNoPhone: deleteNoPhone ? noPhone.length : 0,
    mergeActions: [],
    repointed: { user_vouchers: 0, user_arrival_logs: 0, user_tags: 0 },
    removedUsers: 0
  };

  for (const p of dupPhones) {
    const arr = groups[p].slice().sort((a, b) => score(b) - score(a));
    const keeper = arr[0];
    const losers = arr.slice(1);
    report.mergeActions.push({
      phone: p.slice(0, 3) + '****' + p.slice(-4),
      keep: keeper._id,
      remove: losers.map((l) => l._id)
    });

    if (dryRun) continue;

    const mergedTags = new Set(Array.isArray(keeper.tags) ? keeper.tags : []);
    let maxOrders = num(keeper.total_orders);
    let maxSpent = num(keeper.total_spent);
    let keeperOpenid = keeper.openid || '';
    losers.forEach((l) => {
      (Array.isArray(l.tags) ? l.tags : []).forEach((t) => mergedTags.add(t));
      maxOrders = Math.max(maxOrders, num(l.total_orders));
      maxSpent = Math.max(maxSpent, num(l.total_spent));
      if (!keeperOpenid && l.openid) keeperOpenid = l.openid;
    });

    const patch = {
      total_orders: maxOrders,
      total_spent: maxSpent,
      tags: Array.from(mergedTags),
      updated_at: db.serverDate()
    };
    if (!keeper.openid && keeperOpenid) patch.openid = keeperOpenid;
    await db.collection('users').doc(keeper._id).update({ data: patch });

    for (const l of losers) {
      const [v, a, t] = await Promise.all([
        repoint('user_vouchers', l._id, keeper._id),
        repoint('user_arrival_logs', l._id, keeper._id),
        repoint('user_tags', l._id, keeper._id)
      ]);
      report.repointed.user_vouchers += v;
      report.repointed.user_arrival_logs += a;
      report.repointed.user_tags += t;
      await db.collection('users').doc(l._id).remove();
      report.removedUsers++;
    }
  }

  if (!dryRun && deleteNoPhone) {
    // 并行删除无手机号记录
    await Promise.all(noPhone.map(u => db.collection('users').doc(u._id).remove()));
    report.removedUsers += noPhone.length;
  }

  return { success: true, report };
};
