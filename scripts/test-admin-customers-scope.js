const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function loadBuildCustomerListRequestData() {
  const source = read('pages/admin/customers.js');
  const match = source.match(/function buildCustomerListRequestData\(keyword, app\) \{[\s\S]*?\n\}\n\nPage\(/);
  assert.ok(match, 'customers page should define buildCustomerListRequestData');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(match[0].replace(/\n\nPage\($/, '') + '\nthis.fn = buildCustomerListRequestData;', sandbox);
  return sandbox.fn;
}

function testAdminDoesNotUseScanStoreScope() {
  const buildRequest = loadBuildCustomerListRequestData();
  const request = buildRequest('138', {
    globalData: {
      userRole: 'admin',
      staffStoreId: '',
      scanParams: { store_id: '51866138' }
    }
  });

  assert.strictEqual(request.keyword, '138');
  assert.strictEqual(
    request.store_id,
    '',
    'admin customer list should not be scoped by stale scan store_id'
  );
}

function testNonAdminKeepsStoreScopeFallback() {
  const buildRequest = loadBuildCustomerListRequestData();
  const request = buildRequest('', {
    globalData: {
      userRole: 'manager',
      staffStoreId: '64822111',
      scanParams: { store_id: '51866138' }
    }
  });

  assert.strictEqual(request.keyword, '');
  assert.strictEqual(
    request.store_id,
    '64822111',
    'non-admin customer list should keep the staff store scope'
  );
}

function run() {
  testAdminDoesNotUseScanStoreScope();
  testNonAdminKeepsStoreScopeFallback();
  console.log('test-admin-customers-scope: ok');
}

run();
