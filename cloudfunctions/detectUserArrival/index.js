/**
 * 顾客到店：汇总 users / Users / user_tags，写 user_arrival_logs，返回画像
 */
const cloud = require('wx-server-sdk');
const { syncHrmsGrowthEvent } = require('./hrmsGrowthSync');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const TEN_MIN_MS = 10 * 60 * 1000;

function isDbCollectionMissingError(err) {
  const s = String((err && (err.message || err.errMsg)) || err || '');
  return (
    s.indexOf('-502005') !== -1 ||
    s.indexOf('not exist') !== -1 ||
    s.indexOf('ResourceNotFound') !== -1
  );
}

function toTime(v) {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

function maxDateIso(a, b) {
  const ta = toTime(a);
  const tb = toTime(b);
  if (ta === 0 && tb === 0) return null;
  return new Date(Math.max(ta, tb)).toISOString();
}

async function getTotalOrdersFromUsersCapital(db, openid) {
  if (!openid) return 0;
  try {
    const U = await db
      .collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get();
    if (U.data.length) {
      return parseInt(U.data[0].total_orders, 10) || 0;
    }
  } catch (e) {
    if (!isDbCollectionMissingError(e)) {
      console.warn('detectUserArrival Users.total_orders', e);
    }
  }
  return 0;
}

/**
 * 解析 dish_name 字段：支持 string | string[] | 「A + B、C」
 */
function normalizeDishNameField(raw) {
  if (raw == null || raw === '') {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw
      .map(function (s) {
        return String(s).trim();
      })
      .filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) {
    return [];
  }
  const parts = s
    .split(/[+＋、,，]/)
    .map(function (x) {
      return x.trim();
    })
    .filter(Boolean);
  return parts.length ? parts : [s];
}

/**
 * 订单行 → 参与统计的菜品名列表：
 * 1) voucher_templates.dish_name（映射）
 * 2) items[].dish_name
 * 3) items[].name
 */
async function computeFavoriteDish(db, openid) {
  if (!openid) return '';
  try {
    const snap = await db
      .collection('Orders')
      .where({
        _openid: openid,
        payment_status: 'paid'
      })
      .limit(200)
      .get();
    const templateCache = {};

    async function dishesFromTemplate(voucherId) {
      if (!voucherId) {
        return [];
      }
      const key = String(voucherId);
      if (Object.prototype.hasOwnProperty.call(templateCache, key)) {
        return templateCache[key];
      }
      try {
        const doc = await db.collection('voucher_templates').doc(key).get();
        const d = doc.data;
        const list = normalizeDishNameField(d && d.dish_name);
        templateCache[key] = list;
        return list;
      } catch (e) {
        templateCache[key] = [];
        return [];
      }
    }

    const counts = {};
    for (let i = 0; i < snap.data.length; i++) {
      const o = snap.data[i];
      const items = o.items;
      if (!items || !items.length) continue;
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        const q = Math.max(1, parseInt(it.quantity, 10) || 1);
        let dishes = [];
        if (it.voucher_id) {
          dishes = await dishesFromTemplate(it.voucher_id);
        }
        if (!dishes.length) {
          dishes = normalizeDishNameField(it.dish_name);
        }
        if (!dishes.length) {
          const n = it && it.name != null ? String(it.name).trim() : '';
          if (n) {
            dishes = [n];
          }
        }
        for (let d = 0; d < dishes.length; d++) {
          const dn = dishes[d];
          counts[dn] = (counts[dn] || 0) + q;
        }
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
  } catch (e) {
    if (!isDbCollectionMissingError(e)) {
      console.warn('detectUserArrival computeFavoriteDish', e);
    }
    return '';
  }
}

async function findRecentArrivalLog(db, userId, storeId) {
  const since = new Date(Date.now() - TEN_MIN_MS);
  try {
    const snap = await db
      .collection('user_arrival_logs')
      .where({
        user_id: userId,
        store_id: storeId,
        created_at: _.gte(since)
      })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
    return snap.data.length ? snap.data[0] : null;
  } catch (e) {
    if (isDbCollectionMissingError(e)) {
      return null;
    }
    try {
      const snap2 = await db
        .collection('user_arrival_logs')
        .where({
          user_id: userId,
          store_id: storeId
        })
        .limit(50)
        .get();
      const now = Date.now();
      let best = null;
      let bestT = 0;
      for (let i = 0; i < snap2.data.length; i++) {
        const row = snap2.data[i];
        const t = toTime(row.created_at);
        if (!t || now - t > TEN_MIN_MS) continue;
        if (t > bestT) {
          bestT = t;
          best = row;
        }
      }
      return best;
    } catch (e2) {
      console.warn('detectUserArrival findRecentArrivalLog fallback', e2);
    }
    return null;
  }
}

async function loadUserTags(db, userId) {
  const tags = [];
  try {
    const r = await db
      .collection('user_tags')
      .where({ user_id: userId })
      .limit(50)
      .get();
    for (let i = 0; i < r.data.length; i++) {
      const t = r.data[i].tag;
      if (t && tags.indexOf(t) === -1) tags.push(String(t));
    }
  } catch (e) {
    if (!isDbCollectionMissingError(e)) {
      console.warn('detectUserArrival user_tags', e);
    }
  }
  return tags;
}

function buildProfile(
  totalOrders,
  lastPaymentAt,
  lastVerifyAt,
  spent30dFen,
  tagList,
  favoriteDish
) {
  const spent30 = parseInt(spent30dFen, 10) || 0;
  let user_level = 'regular';
  if (spent30 > 50000) {
    user_level = 'vip';
  } else if (totalOrders === 0) {
    user_level = 'new';
  } else {
    user_level = 'regular';
  }

  const is_new = totalOrders === 0;

  return {
    is_new: is_new,
    total_visits: totalOrders,
    last_visit_time: maxDateIso(lastPaymentAt, lastVerifyAt),
    user_level: user_level,
    tags: tagList.slice(),
    favorite_dish: favoriteDish != null && String(favoriteDish).trim() ? String(favoriteDish).trim() : ''
  };
}

exports.main = async function (event) {
  const { OPENID } = cloud.getWXContext();
  const storeId =
    event && event.store_id != null ? String(event.store_id).trim() : '';

  if (!OPENID) {
    return { success: false, message: '缺少 OPENID' };
  }
  if (!storeId) {
    return { success: false, message: '缺少 store_id' };
  }

  try {
    const ur = await db
      .collection('users')
      .where({ openid: OPENID })
      .limit(1)
      .get();

    if (!ur.data.length) {
      return { success: false, message: '无 users 档案，请先打开小程序完成建档' };
    }

    const userRow = ur.data[0];
    const user_id = userRow._id;

    const total_orders = await getTotalOrdersFromUsersCapital(db, OPENID);
    const last_payment_at = userRow.last_payment_at || null;
    const last_verify_at = userRow.last_verify_at || null;
    const total_spent_30d =
      userRow.total_spent_30d != null ? userRow.total_spent_30d : 0;

    const tagList = await loadUserTags(db, user_id);
    const favoriteDish = await computeFavoriteDish(db, OPENID);

    const recentLog = await findRecentArrivalLog(db, user_id, storeId);
    if (recentLog && recentLog.profile) {
      const merged = Object.assign({}, recentLog.profile, {
        favorite_dish: favoriteDish || recentLog.profile.favorite_dish || ''
      });
      return {
        success: true,
        profile: merged,
        user_id: user_id,
        deduped: true
      };
    }

    const profile = buildProfile(
      total_orders,
      last_payment_at,
      last_verify_at,
      total_spent_30d,
      tagList,
      favoriteDish
    );

    try {
      await db.collection('user_arrival_logs').add({
        data: {
          user_id: user_id,
          store_id: storeId,
          profile: profile,
          created_at: db.serverDate()
        }
      });
    } catch (logErr) {
      if (isDbCollectionMissingError(logErr)) {
        console.warn('user_arrival_logs 集合不存在，跳过写入');
      } else {
        throw logErr;
      }
    }

    await syncHrmsGrowthEvent({
      event_type: 'customer_arrived',
      phone: userRow.phone,
      openid: userRow.openid || userRow._openid || OPENID,
      store_id: storeId,
      campaign_id: event && event.campaign_id || '',
      idempotency_key: 'customer_arrived:' + user_id + ':' + storeId + ':' + Math.floor(Date.now() / TEN_MIN_MS),
      metadata: {
        profile: profile
      }
    }).catch(function (e) {
      console.warn('HRMS customer_arrived sync failed', e && e.message);
    });

    return { success: true, profile: profile, user_id: user_id, deduped: false };
  } catch (err) {
    console.error('detectUserArrival', err);
    return { success: false, message: err.message || String(err) };
  }
};
