/**
 * 按 openid 查找或创建 users 文档，返回 users._id
 */
async function ensureUser(db, openid, patch) {
  patch = patch || {};
  const r = await db
    .collection('users')
    .where({ openid: openid })
    .limit(1)
    .get();

  if (r.data.length) {
    const id = r.data[0]._id;
    const data = {};
    if (patch.phone !== undefined && patch.phone !== null) data.phone = String(patch.phone);
    if (patch.external_userid !== undefined) data.external_userid = String(patch.external_userid || '');
    if (Object.keys(data).length) {
      data.updated_at = db.serverDate();
      await db.collection('users').doc(id).update({ data: data });
    }
    return id;
  }

  const add = await db.collection('users').add({
    data: {
      openid: openid,
      external_userid: patch.external_userid != null ? String(patch.external_userid) : '',
      phone: patch.phone != null ? String(patch.phone) : '',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return add._id;
}

async function logAnalytics(db, payload) {
  try {
    await db.collection('analytics_logs').add({
      data: {
        user_id: payload.user_id != null ? String(payload.user_id) : '',
        action: String(payload.action || ''),
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        created_at: db.serverDate()
      }
    });
  } catch (e) {
    console.error('analytics_logs', e);
  }
}

module.exports = {
  ensureUser,
  logAnalytics
};
