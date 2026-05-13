/**
 * users 集合：openid → user_id（_id）
 * 不在此自动建用户；列表为空时请用户先完成授权/下单等会建 users 的流程。
 */
async function resolveUserIdFromOpenid(db, openid) {
  if (!openid) return null;
  const r = await db
    .collection('users')
    .where({ openid: openid })
    .limit(1)
    .get();
  return r.data.length ? r.data[0]._id : null;
}

module.exports = {
  resolveUserIdFromOpenid
};
