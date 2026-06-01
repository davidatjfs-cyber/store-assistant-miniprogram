const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function loadSubscribeHelpers() {
  const source = read('pages/index/index.js');
  const idsMatch = source.match(/var ORDER_SUBSCRIBE_TEMPLATE_IDS = \[[\s\S]*?\];/);
  const helperMatch = source.match(/function getAcceptedSubscribeTemplateId\(res, templateIds\) \{[\s\S]*?\n\}/);
  assert.ok(idsMatch, 'index page should define ORDER_SUBSCRIBE_TEMPLATE_IDS');
  assert.ok(helperMatch, 'index page should define getAcceptedSubscribeTemplateId');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    idsMatch[0] + '\n' + helperMatch[0] + '\nthis.ids = ORDER_SUBSCRIBE_TEMPLATE_IDS; this.accepted = getAcceptedSubscribeTemplateId;',
    sandbox
  );
  return { ids: sandbox.ids, accepted: sandbox.accepted };
}

function testAcceptAllowsOrder() {
  const h = loadSubscribeHelpers();
  const res = {};
  res[h.ids[0]] = 'accept';
  assert.strictEqual(h.accepted(res, h.ids), h.ids[0]);
}

function testRejectBlocksOrder() {
  const h = loadSubscribeHelpers();
  const res = {};
  res[h.ids[0]] = 'reject';
  assert.strictEqual(h.accepted(res, h.ids), '');
}

function testBanBlocksOrder() {
  const h = loadSubscribeHelpers();
  const res = {};
  res[h.ids[0]] = 'ban';
  assert.strictEqual(h.accepted(res, h.ids), '');
}

function run() {
  testAcceptAllowsOrder();
  testRejectBlocksOrder();
  testBanBlocksOrder();
  console.log('test-order-subscribe-gate: ok');
}

run();
