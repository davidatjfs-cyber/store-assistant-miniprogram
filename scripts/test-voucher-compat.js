const assert = require('assert');
const fs = require('fs');
const path = require('path');

const voucherHelpers = require('../cloudfunctions/getUserVouchers/helpers.js');
const paymentResult = require('../utils/payment-result.js');

function testNormalizeLegacyVoucher() {
  assert.strictEqual(
    typeof voucherHelpers.normalizeVoucherRowForClient,
    'function',
    'normalizeVoucherRowForClient should be exported'
  );

  const now = new Date('2026-05-26T12:00:00+08:00');
  const normalized = voucherHelpers.normalizeVoucherRowForClient(
    {
      _id: 'uv_legacy_1',
      status: 'active',
      expire_at: new Date('2026-05-30T12:00:00+08:00'),
      voucher_code: 'VC123'
    },
    { now: now }
  );

  assert.strictEqual(normalized.row.status, 'unused');
  assert.strictEqual(normalized.row.qr_code, 'voucher:uv_legacy_1');
  assert.strictEqual(normalized.patch.status, 'unused');
}

function testPreserveExpiredVoucher() {
  const now = new Date('2026-05-26T12:00:00+08:00');
  const normalized = voucherHelpers.normalizeVoucherRowForClient(
    {
      _id: 'uv_expired_1',
      status: 'active',
      expire_at: new Date('2026-05-20T12:00:00+08:00')
    },
    { now: now }
  );

  assert.strictEqual(normalized.row.status, 'expired');
  assert.strictEqual(normalized.row.qr_code, 'voucher:uv_expired_1');
}

function testMissingPaymentParams() {
  assert.strictEqual(
    typeof paymentResult.resolveCreatePaymentResult,
    'function',
    'resolveCreatePaymentResult should be exported'
  );

  const resolved = paymentResult.resolveCreatePaymentResult({
    success: true,
    data: {
      order_id: '5290ec146a154a7800b9439869ae85b0',
      order_no: 'ORD20260526277214',
      total_amount: 3000
    }
  });

  assert.strictEqual(resolved.type, 'missing_payment');
  assert.ok(resolved.message.indexOf('支付参数缺失') >= 0);
}

function testCreatePaymentContainsSubMchId() {
  const source = fs.readFileSync(
    path.join(__dirname, '../cloudfunctions/createPayment/index.js'),
    'utf8'
  );
  assert.ok(
    source.indexOf('subMchId') >= 0,
    'createPayment cloudPay request should include subMchId'
  );
  assert.ok(
    source.indexOf("envId: CLOUD_PAY_ENV_ID") >= 0,
    'createPayment cloudPay request should include explicit envId'
  );
}

function run() {
  testNormalizeLegacyVoucher();
  testPreserveExpiredVoucher();
  testMissingPaymentParams();
  testCreatePaymentContainsSubMchId();
  console.log('test-voucher-compat: ok');
}

run();
