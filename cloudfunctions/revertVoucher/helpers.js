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

async function findActiveStaff(db, openid) {
  if (!openid) return null;
  const r = await db
    .collection('staff')
    .where({ openid: openid, active: true })
    .limit(1)
    .get();
  return r.data.length ? r.data[0] : null;
}

module.exports = { logAnalytics, findActiveStaff };
