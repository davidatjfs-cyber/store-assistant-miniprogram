/**
 * 店员补全到店老客资料：姓 + 性别（第一期）
 *
 * 仅限在职 staff/manager/admin 调用。把「姓」「性别」写入 users 文档，
 * 并派生中文称谓 title（如「张先生」「李女士」），供短信/营销文案使用。
 *
 * 入参 event: { user_id: string, surname: string, gender: 'male'|'female' }
 */
const cloud = require('wx-server-sdk');
const { syncHrmsGrowthEvent } = require('./hrmsGrowthSync');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function getActiveStaffByOpenid(openid) {
  if (!openid) return null;
  const r = await db
    .collection('staff')
    .where({ openid: openid, active: true })
    .limit(1)
    .get();
  return r.data.length ? r.data[0] : null;
}

exports.main = async function (event, context) {
  const { OPENID } = cloud.getWXContext();

  const staff = await getActiveStaffByOpenid(OPENID);
  const role = staff ? String(staff.role || 'staff').toLowerCase() : '';
  if (role !== 'staff' && role !== 'manager' && role !== 'admin') {
    return { success: false, message: '无权限' };
  }

  const userId = event && event.user_id ? String(event.user_id).trim() : '';
  const surname = event && event.surname ? String(event.surname).trim() : '';
  const gender = event && event.gender ? String(event.gender).trim() : '';

  if (!userId) return { success: false, message: '缺少用户标识' };
  // 姓：1~2 个中文字符（复姓如「欧阳」）
  if (!/^[一-龥]{1,2}$/.test(surname)) {
    return { success: false, message: '请输入正确的中文姓氏' };
  }
  if (gender !== 'male' && gender !== 'female') {
    return { success: false, message: '请选择性别' };
  }

  const title = surname + (gender === 'male' ? '先生' : '女士');

  try {
    await db.collection('users').doc(userId).update({
      data: {
        surname: surname,
        gender: gender,
        title: title,
        profile_updated_at: db.serverDate(),
        profile_updated_by: OPENID
      }
    });
  } catch (err) {
    console.error('updateCustomerProfile', err);
    return { success: false, message: (err && err.message) || String(err) };
  }

  // 同步姓名/性别/称谓到 HRMS（以手机号/openid 关联客户）。失败不影响保存结果。
  try {
    const doc = await db.collection('users').doc(userId).get();
    const u = (doc && doc.data) || {};
    const phone = u.phone != null ? String(u.phone).trim() : '';
    const openid = u.openid != null ? String(u.openid).trim() : '';
    if (phone || openid) {
      await syncHrmsGrowthEvent({
        event_type: 'customer_profile_updated',
        phone: phone,
        openid: openid,
        store_id: staff && staff.store_id != null ? String(staff.store_id) : '',
        customer_meta: { surname: surname, gender: gender, title: title },
        idempotency_key: 'profile_updated:' + userId + ':' + Date.now()
      });
    }
  } catch (e) {
    console.warn('HRMS profile sync failed', e && e.message);
  }

  return { success: true, title: title, surname: surname, gender: gender };
};
