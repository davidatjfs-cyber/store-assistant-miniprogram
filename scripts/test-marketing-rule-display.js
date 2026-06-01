const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function loadMarketingDisplayHelpers() {
  const source = read('pages/admin/marketing.js');
  const helperNames = [
    'formatYuanFromFen',
    'formatVoucherTemplateOption',
    'formatTriggerValueDisplay'
  ];
  const snippets = helperNames.map((name) => {
    const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'm'));
    assert.ok(match, `marketing page should define ${name}`);
    return match[0];
  });
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    snippets.join('\n') +
      '\nthis.formatVoucherTemplateOption = formatVoucherTemplateOption;' +
      '\nthis.formatTriggerValueDisplay = formatTriggerValueDisplay;',
    sandbox
  );
  return sandbox;
}

function testVoucherTemplateOptionUsesChineseName() {
  const h = loadMarketingDisplayHelpers();
  const option = h.formatVoucherTemplateOption({
    _id: 'hc_tpl_vip_001',
    name: 'VIP专享券',
    value: 3000,
    min_spend: 12000,
    store_display_name: '洪潮潮汕传统菜'
  });
  assert.strictEqual(option.id, 'hc_tpl_vip_001');
  assert.strictEqual(option.name, 'VIP专享券（面值30元，满120元可用，洪潮潮汕传统菜）');
}

function testPaymentTriggerDisplaysBusinessMeaning() {
  const h = loadMarketingDisplayHelpers();
  assert.strictEqual(h.formatTriggerValueDisplay('payment', '3000'), '实付满30元后发券');
  assert.strictEqual(h.formatTriggerValueDisplay('payment', '0'), '支付成功后发券（无消费门槛）');
}

function testInactivityTriggerDisplaysDays() {
  const h = loadMarketingDisplayHelpers();
  assert.strictEqual(h.formatTriggerValueDisplay('inactivity', '7'), '7天未到店后发券');
}

function run() {
  testVoucherTemplateOptionUsesChineseName();
  testPaymentTriggerDisplaysBusinessMeaning();
  testInactivityTriggerDisplaysDays();
  console.log('test-marketing-rule-display: ok');
}

run();
