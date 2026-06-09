/**
 * 门店近期核销记录：仅店员/店长/管理员；按 staff.store_id 过滤。
 * 给核销台「近期核销记录」列表用，店员可事后复查每一笔核销的「中文活动名 + 面额 + 券码 + 时间」，
 * 对账 POS（我们与 POS 未打通，靠这份留痕复核手工记账是否漏记/错记）。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

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
  if (role !== 'staff' && role !== 'manager' && role !== 'admin') role = 'staff';
  return role;
}

function pickStoreId(row) {
  if (!row) return '';
  const v = row.store_id != null && String(row.store_id).trim()
    ? row.store_id
    : (row.storeId != null ? row.storeId : '');
  return String(v).trim();
}

function toDateMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  const ms = new Date(v).getTime();
  return isNaN(ms) ? null : ms;
}

// 上海时区「06-09 13:10」给店员看（同日省略年份，列表更紧凑）
function fmtTime(v) {
  const ms = toDateMs(v);
  if (ms == null) return '';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(ms));
  const g = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value || ''; };
  return g('month') + '-' + g('day') + ' ' + g('hour') + ':' + g('minute');
}

exports.main = async function (event) {
  const { OPENID } = cloud.getWXContext();
  try {
    const staff = await getActiveStaffByOpenid(OPENID);
    const role = normalizeRole(staff);
    if (role !== 'staff' && role !== 'manager' && role !== 'admin') {
      return { success: false, message: '无权限', items: [] };
    }
    const storeScope = pickStoreId(staff);
    if (!storeScope) return { success: false, message: '未绑定门店', items: [] };

    const limit = Math.min(Math.max(Number(event && event.limit) || 20, 1), 50);
    let snap;
    try {
      snap = await db.collection('voucher_logs')
        .where({ store_id: storeScope, action: 'verify', reverted: _.neq(true) })
        .orderBy('created_at', 'desc')
        .limit(limit)
        .get();
    } catch (e) {
      return { success: true, items: [] };
    }

    const items = (snap.data || []).map(function (r) {
      const valFen = Number(r.value_fen) || 0;
      const valYuan = Math.round(valFen / 100);
      const name = r.coupon_name || '营销券';
      const type = r.coupon_type || '';
      const label = r.coupon_label || (
        name + (type === 'cash' && valYuan > 0 ? '（' + valYuan + '元现金券）' : (type === 'gift' ? '（赠菜券）' : ''))
      );
      return {
        log_id: r._id,
        time_text: fmtTime(r.created_at),
        coupon_label: label,
        coupon_name: name,
        coupon_type: type,
        value_fen: valFen,
        value_yuan: valYuan,
        short_code: r.short_code || ''
      };
    });

    return { success: true, items: items };
  } catch (err) {
    return { success: false, message: (err && err.message) || '查询失败', items: [] };
  }
};
