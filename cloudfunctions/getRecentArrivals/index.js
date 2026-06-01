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
    prospect: '潜在新客',
    new: '新客',
    active: '活跃客',
    at_risk: '临界客',
    dormant: '沉睡老客',
    churned: '流失客',
    vip: 'VIP',
    regular: '常规价值',
    low: '低价值'
  };
  const out = [];
  (tags || []).forEach(function (t) {
    const k = String(t);
    out.push(map[k] || k);
  });
  return out;
}

function lifecycleLabel(stage) {
  const map = {
    prospect: '潜在新客',
    new: '新客',
    active: '活跃客',
    at_risk: '临界客',
    dormant: '沉睡老客',
    churned: '流失客'
  };
  return map[stage] || map.prospect;
}

function normalizeLifecycleStage(stage) {
  const s = String(stage || '').trim();
  if (s === 'prospect' || s === 'new' || s === 'active' || s === 'at_risk' || s === 'dormant' || s === 'churned') return s;
  if (s === 'regular' || s === 'vip') return 'active';
  return 'prospect';
}

// 返回 { name, surname, gender, title }，title 为已补全的中文称谓（如「张先生」）
async function profileForUser(userId) {
  let name = '';
  let surname = '';
  let gender = '';
  let title = '';
  try {
    const doc = await db.collection('users').doc(userId).get();
    const u = doc.data;
    if (u) {
      surname = u.surname != null ? String(u.surname).trim() : '';
      gender = u.gender != null ? String(u.gender).trim() : '';
      title = u.title != null ? String(u.title).trim() : '';
      const phone = u.phone != null ? String(u.phone).trim() : '';
      if (phone.length >= 4) {
        name = '顾客' + phone.slice(-4);
      } else if (u.nickName) {
        name = String(u.nickName).slice(0, 12);
      }
    }
  } catch (e) {
    // ignore
  }
  if (!name) name = '顾客' + String(userId).slice(-4);
  return { name: name, surname: surname, gender: gender, title: title };
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
      const prof = await profileForUser(uid);
      const name = prof.name;
      const lastT = profile.last_visit_time || row.created_at;
      const tags = Array.isArray(profile.tags) ? profile.tags : [];
      const stage = normalizeLifecycleStage(profile.lifecycle_stage || profile.user_level);
      const isVip =
        profile.value_tier === 'vip' || tags.indexOf('vip') >= 0;
      const fav = profile.favorite_dish != null ? String(profile.favorite_dish).trim() : '';
      items.push({
        user_id: uid,
        display_name: name,
        surname: prof.surname,
        gender: prof.gender,
        title: prof.title,
        level_suffix: isVip ? '（VIP）' : '',
        is_new: stage === 'new',
        total_visits: profile.total_visits != null ? profile.total_visits : 0,
        recent_label: daysAgoLabel(lastT),
        tag_labels: tagLabels(tags),
        user_level: stage,
        user_level_label: lifecycleLabel(stage),
        value_tier: profile.value_tier || '',
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
