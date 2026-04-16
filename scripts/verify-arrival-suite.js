#!/usr/bin/env node
/**
 * 本地验证：到店去重、favorite_dish 计数、fallback 选窗、getRecentArrivals 字段清单
 * 与 cloudfunctions/detectUserArrival/index.js 中算法对齐（无 voucher_templates 分支时仅用 name）
 *
 * 运行：node scripts/verify-arrival-suite.js
 */

const TEN_MIN_MS = 10 * 60 * 1000;

function toTime(v) {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

/** 与 computeFavoriteDish 一致：仅 items[].name + quantity（忽略 voucher_id 时） */
function favoriteDishFromOrders(orders) {
  const counts = {};
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (o.payment_status && o.payment_status !== 'paid') continue;
    const items = o.items;
    if (!items || !items.length) continue;
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      const q = Math.max(1, parseInt(it.quantity, 10) || 1);
      const n = it && it.name != null ? String(it.name).trim() : '';
      if (!n) continue;
      counts[n] = (counts[n] || 0) + q;
    }
  }
  let bestName = '';
  let bestCnt = 0;
  const keys = Object.keys(counts);
  for (let k = 0; k < keys.length; k++) {
    const name = keys[k];
    const c = counts[name];
    if (c > bestCnt) {
      bestCnt = c;
      bestName = name;
    }
  }
  return bestName;
}

/** 与 findRecentArrivalLog fallback 分支一致 */
function findRecentArrivalViaFallback(logRows, userId, storeId, nowMs) {
  let best = null;
  let bestT = 0;
  for (let i = 0; i < logRows.length; i++) {
    const row = logRows[i];
    if (row.user_id !== userId || row.store_id !== storeId) continue;
    const t = toTime(row.created_at);
    if (!t || nowMs - t > TEN_MIN_MS) continue;
    if (t > bestT) {
      bestT = t;
      best = row;
    }
  }
  return best;
}

function section(title) {
  console.log('\n' + '='.repeat(60) + '\n' + title + '\n' + '='.repeat(60));
}

function main() {
  section('一、10 分钟去重（逻辑预期；云上要同一 OPENID + users._id）');

  const userId = 'test_user_001';
  const storeId = 'store_maijixian_001';
  const now = Date.now();

  const logAfterFirst = {
    user_id: userId,
    store_id: storeId,
    created_at: new Date(now - 60 * 1000),
    profile: { is_new: true, total_visits: 0, user_level: 'new', favorite_dish: '' }
  };

  console.log('第一次调用（预期）：');
  console.log(JSON.stringify({ success: true, deduped: false, user_id: userId }, null, 2));
  console.log('user_arrival_logs：条数 +1');

  const hit = findRecentArrivalViaFallback([logAfterFirst], userId, storeId, now);
  console.log('\n第二次调用前，fallback 能否在 1 分钟内命中同店同用户：', !!hit);

  const newFavorite = '烧鹅';
  const merged = Object.assign({}, hit.profile, {
    favorite_dish: newFavorite || hit.profile.favorite_dish || ''
  });

  console.log('\n第二次调用（预期，间隔 <10 分钟，同一 store）：');
  console.log(
    JSON.stringify(
      {
        success: true,
        deduped: true,
        user_id: userId,
        profile: merged
      },
      null,
      2
    )
  );
  console.log('user_arrival_logs：条数不变（不 add）');
  console.log(
    '\n说明：真实云函数以 OPENID 查 users，user_id 为 users 文档 _id；手动测请保证 users._id 与 logs.user_id 一致。'
  );

  section('二、favorite_dish（仅 name/quantity，与无 voucher_id 的订单一致）');

  const order1 = {
    _openid: 'mock',
    payment_status: 'paid',
    items: [
      { name: '烧鹅', quantity: 2 },
      { name: '肠粉', quantity: 1 }
    ]
  };
  const order2 = {
    _openid: 'mock',
    payment_status: 'paid',
    items: [{ name: '烧鹅', quantity: 1 }]
  };
  let orders = [order1, order2];
  let fav = favoriteDishFromOrders(orders);
  console.log('订单1+2 后 favorite_dish（预期 烧鹅：2+1=3 > 肠粉 1）→', fav);

  const order3 = {
    _openid: 'mock',
    payment_status: 'paid',
    items: [{ name: '肠粉', quantity: 5 }]
  };
  orders = [order1, order2, order3];
  fav = favoriteDishFromOrders(orders);
  console.log('再加订单3（肠粉+5）后（预期 肠粉：1+5=6 > 烧鹅 3）→', fav);

  section('三、去重 + favorite_dish 刷新（内存合并逻辑与云函数一致）');

  const storedProfile = {
    is_new: false,
    total_visits: 3,
    user_level: 'regular',
    favorite_dish: '烧鹅',
    tags: []
  };
  const logRow = {
    user_id: userId,
    store_id: storeId,
    created_at: new Date(now - 2 * 60 * 1000),
    profile: storedProfile
  };
  const recomputed = '肠粉';
  const merged2 = Object.assign({}, logRow.profile, {
    favorite_dish: recomputed || logRow.profile.favorite_dish || ''
  });
  console.log('库中旧 profile.favorite_dish:', storedProfile.favorite_dish);
  console.log('本次重算 favorite_dish:', recomputed);
  console.log('返回 profile（deduped=true，不写库）:', JSON.stringify(merged2, null, 2));

  section('四、索引不可用 → fallback');

  console.log(
    '云函数行为：主查询 where+orderBy(created_at) 抛错时，若错误串不含 collection 不存在，则进入 fallback（where 仅 user_id+store_id，limit 50，内存筛 10 分钟）。'
  );
  console.log(
    '若错误为 -502005 / not exist：当前实现直接 return null，不会 fallback（见 isDbCollectionMissingError 分支）。'
  );
  const fallbackRow = findRecentArrivalViaFallback(
    [
      {
        user_id: userId,
        store_id: storeId,
        created_at: new Date(now - 3 * 60 * 1000),
        profile: { x: 1 }
      },
      {
        user_id: userId,
        store_id: storeId,
        created_at: new Date(now - 20 * 60 * 1000),
        profile: { x: 2 }
      }
    ],
    userId,
    storeId,
    now
  );
  console.log(
    '模拟 fallback 数据：3 分钟前一条 + 20 分钟前一条 → 命中较新一条：',
    fallbackRow && fallbackRow.profile && fallbackRow.profile.x === 1 ? '是' : '否'
  );

  section('五、getRecentArrivals 每条 items[] 字段（见 cloudfunctions/getRecentArrivals/index.js）');

  const shape = {
    user_id: 'string',
    display_name: 'string',
    level_suffix: 'string（VIP 时为「（VIP）」，否则空串）',
    is_new: 'boolean',
    total_visits: 'number',
    recent_label: 'string（今天|昨天|N天前|—）',
    tag_labels: 'string[]',
    user_level: 'string（new|regular|vip）',
    favorite_dish: 'string',
    created_at: 'Date | serverDate'
  };
  console.log(JSON.stringify(shape, null, 2));
  console.log('顶层：{ success: true, items: [ ... ] }');

  section('六、pages/staff/verify 渲染逻辑');

  console.log([
    '1. 模块容器：wx:if="{{arrivalsLoaded && arrivals.length}}" → 无数据整块不渲染。',
    '2. 每条：display_name + level_suffix（VIP 括号）；右侧/同行 level-tag 由 user_level 着色（VIP/新客/常客）。',
    '3. 来店次数：total_visits；最近：recent_label。',
    '4. 偏好：wx:if="{{item.favorite_dish}}" 时显示「偏好：xxx」。',
    '5. tag_labels 非空时展示标签 chips。'
  ].join('\n'));
}

main();
