/**
 * 门店最近到店记录：仅店员/店长/管理员；按 staff.store_id 过滤
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function isDbCollectionMissingError(err) {
  const s = String((err && (err.message || err.errMsg)) || err || '');
  return (
    s.indexOf('-502005') !== -1 ||
    s.indexOf('not exist') !== -1 ||
    s.indexOf('ResourceNotFound') !== -1
  );
}

async function getActiveStaffByOpenid(openid) {
  if (!openid) return null;
  const r = await db
    .collection('staff')
    .where({ openid: openid, active: true })
    .limit(1)
    .get();
  return r.data.length ? r.data[0] : null;
}

function normalizeRole(row) {
  if (!row) return null;
  let role = String(row.role || 'staff').toLowerCase();
  if (role !== 'staff' && role !== 'manager' && role !== 'admin') {
    role = 'staff';
  }
  return role;
}

function pickStoreId(row) {
  if (!row) return '';
  const v =
    row.store_id != null && String(row.store_id).trim()
      ? row.store_id
      : row.storeId != null
        ? row.storeId
        : '';
  return String(v).trim();
}

function daysAgoLabel(isoOrDate) {
  if (!isoOrDate) return '—';
  const t = new Date(isoOrDate).getTime();
  if (isNaN(t)) return '—';
  const diff = Date.now() - t;
  const days = Math.floor(diff / 86400000);
  if (days < 0) return '刚刚';
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return String(days) + '天前';
}

function tagLabels(tags) {
  const map = {
    vip: 'VIP',
    frequent: '常客',
    inactive: '未活跃',
    new: '新客',
    high_value: '高价值',
    low_value: '低价值',
    general: '普通'
  };
  const out = [];
  (tags || []).forEach(function (t) {
    const k = String(t);
    out.push(map[k] || k);
  });
  return out;
}

async function displayNameForUser(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get();
    const u = doc.data;
    if (!u) return '顾客';
    const phone = u.phone != null ? String(u.phone).trim() : '';
    if (phone.length >= 4) {
      return '顾客' + phone.slice(-4);
    }
    if (u.nickName) return String(u.nickName).slice(0, 12);
  } catch (e) {
    // ignore
  }
  const s = String(userId);
  return '顾客' + s.slice(-4);
}

exports.main = async function (event, context) {
  const { OPENID } = cloud.getWXContext();

  try {
    const staff = await getActiveStaffByOpenid(OPENID);
    const role = normalizeRole(staff);
    if (role !== 'staff' && role !== 'manager' && role !== 'admin') {
      return { success: false, message: '无权限', items: [] };
    }

    const storeScope = pickStoreId(staff);
    if (!storeScope) {
      return { success: false, message: '未绑定门店', items: [] };
    }

    let snap;
    try {
      snap = await db
        .collection('user_arrival_logs')
        .where({ store_id: storeScope })
        .orderBy('created_at', 'desc')
        .limit(10)
        .get();
    } catch (e) {
      if (isDbCollectionMissingError(e)) {
        return { success: true, items: [] };
      }
      throw e;
    }

    const items = [];
    for (let i = 0; i < snap.data.length; i++) {
      const row = snap.data[i];
      const uid = row.user_id;
      const profile = row.profile || {};
      const name = await displayNameForUser(uid);
      const lastT = profile.last_visit_time || row.created_at;
      const tags = Array.isArray(profile.tags) ? profile.tags : [];
      const isVip =
        profile.user_level === 'vip' || tags.indexOf('vip') >= 0;
      const fav = profile.favorite_dish != null ? String(profile.favorite_dish).trim() : '';
      items.push({
        user_id: uid,
        display_name: name,
        level_suffix: isVip ? '（VIP）' : '',
        is_new: !!profile.is_new,
        total_visits: profile.total_visits != null ? profile.total_visits : 0,
        recent_label: daysAgoLabel(lastT),
        tag_labels: tagLabels(tags),
        user_level: profile.user_level || 'regular',
        favorite_dish: fav,
        created_at: row.created_at
      });
    }

    return { success: true, items: items };
  } catch (err) {
    console.error('getRecentArrivals', err);
    return { success: false, message: err.message || String(err), items: [] };
  }
};
