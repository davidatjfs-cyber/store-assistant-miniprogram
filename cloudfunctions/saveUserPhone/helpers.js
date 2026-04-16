async function upsertUserByOpenid(db, openid, patch) {
  patch = patch || {};
  const r = await db
    .collection('users')
    .where({ openid: openid })
    .limit(1)
    .get();

  if (r.data.length) {
    const id = r.data[0]._id;
    const data = {
      phone: patch.phone != null ? String(patch.phone) : r.data[0].phone || '',
      updated_at: db.serverDate()
    };
    if (patch.external_userid !== undefined) {
      data.external_userid = String(patch.external_userid || '');
    }
    await db.collection('users').doc(id).update({ data: data });
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

module.exports = { upsertUserByOpenid };
