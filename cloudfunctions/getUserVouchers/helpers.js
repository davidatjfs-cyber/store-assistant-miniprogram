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

function toDateMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  const ms = d.getTime();
  return isNaN(ms) ? null : ms;
}

function normalizeVoucherRowForClient(row, options) {
  const nowMs = toDateMs(options && options.now) || Date.now();
  const normalized = Object.assign({}, row || {});
  const patch = {};

  const expMs = toDateMs(normalized.expire_at);
  if (expMs != null && expMs < nowMs) {
    if (normalized.status !== 'expired') {
      normalized.status = 'expired';
      patch.status = 'expired';
    }
  } else if (normalized.status === 'active') {
    normalized.status = 'unused';
    patch.status = 'unused';
  }

  if (!normalized.qr_code && normalized._id) {
    normalized.qr_code = 'voucher:' + normalized._id;
    patch.qr_code = normalized.qr_code;
  }

  return {
    row: normalized,
    patch: patch
  };
}

module.exports = {
  resolveUserIdFromOpenid,
  normalizeVoucherRowForClient
};
