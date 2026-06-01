const assert = require('assert');

const lifecycle = require('../cloudfunctions/runMarketingEngine/userLifecycle');

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function stage(user, hints) {
  return lifecycle.deriveHrmsLifecycleStage(user, hints || {});
}

assert.strictEqual(
  stage({ total_orders: 0, created_at: daysAgo(1) }),
  'prospect',
  '0-order customers must follow HRMS prospect lifecycle'
);

assert.strictEqual(
  stage({ total_orders: 0, last_payment_at: daysAgo(1) }, { is_first_order: true }),
  'new',
  'payment callback first-order hints must be treated as 1 paid order'
);

assert.strictEqual(
  stage({ total_orders: 1, last_payment_at: daysAgo(3) }),
  'new',
  '1-order customers with a visit in the last 14 days must be new'
);

assert.strictEqual(
  stage({ total_orders: 3, last_verify_at: daysAgo(5) }),
  'active',
  '2+ order customers with a visit in the last 14 days must be active'
);

assert.strictEqual(
  stage({ total_orders: 2, last_verify_at: daysAgo(20) }),
  'at_risk',
  'customers 14-30 days from last visit must be at_risk'
);

assert.strictEqual(
  stage({ total_orders: 2, last_verify_at: daysAgo(45) }),
  'dormant',
  '30+ day customers with 2+ orders must be dormant'
);

assert.strictEqual(
  stage({ total_orders: 1, last_payment_at: daysAgo(45) }),
  'churned',
  '30+ day customers with 1 order must be churned'
);

assert.strictEqual(
  lifecycle.resolveUserSegment(['dormant', 'vip']),
  'dormant',
  'marketing segment must prioritize HRMS lifecycle over value tier'
);

function makeMockDb(user, tagRows) {
  return {
    collection(name) {
      return {
        where() {
          return {
            get: async () => ({ data: name === 'user_tags' ? tagRows : [] })
          };
        },
        doc() {
          return {
            get: async () => ({ data: user })
          };
        }
      };
    }
  };
}

async function main() {
  const dormantDb = makeMockDb(
    { total_orders: 2, last_verify_at: daysAgo(45) },
    []
  );
  assert.strictEqual(
    await lifecycle.userMatchesTargetTags(dormantDb, 'u1', ['dormant']),
    true,
    'target_tags must match derived HRMS lifecycle when user_tags is stale or empty'
  );

  const vipDb = makeMockDb(
    { total_orders: 2, last_verify_at: daysAgo(1), value_tier: 'vip' },
    [{ tag: 'active' }]
  );
  assert.strictEqual(
    await lifecycle.userMatchesTargetTags(vipDb, 'u2', ['vip']),
    true,
    'target_tags may use HRMS value_tier without changing lifecycle segment'
  );

  console.log('HRMS lifecycle tag tests passed');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
