const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function loadCanNavigateToOrder() {
  const source = read('pages/index/index.js');
  const match = source.match(/function canNavigateToOrder\(pageData\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'index page should define canNavigateToOrder');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(match[0] + '\nthis.fn = canNavigateToOrder;', sandbox);
  return sandbox.fn;
}

function testBlocksUnauthorisedScanOrder() {
  const canNavigateToOrder = loadCanNavigateToOrder();
  assert.strictEqual(
    canNavigateToOrder({
      isFromScan: true,
      hasAuthorizedMember: false
    }),
    false,
    'scan table ordering should require phone authorization'
  );
}

function testAllowsAuthorisedScanOrder() {
  const canNavigateToOrder = loadCanNavigateToOrder();
  assert.strictEqual(
    canNavigateToOrder({
      isFromScan: true,
      hasAuthorizedMember: true
    }),
    true,
    'authorized scan users should be allowed to order'
  );
}

function testKeepsNonScanOrderAvailable() {
  const canNavigateToOrder = loadCanNavigateToOrder();
  assert.strictEqual(
    canNavigateToOrder({
      isFromScan: false,
      hasAuthorizedMember: false
    }),
    true,
    'non-scan entry should not be blocked by the table-code authorization gate'
  );
}

function run() {
  testBlocksUnauthorisedScanOrder();
  testAllowsAuthorisedScanOrder();
  testKeepsNonScanOrderAvailable();
  console.log('test-order-auth-gate: ok');
}

run();
