const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function testAppHasPerStoreOrderConfig() {
  const source = read('app.js');
  assert.ok(
    source.includes('orderMiniProgramConfigs'),
    'app.js should define per-store order mini program configs'
  );
  assert.ok(
    source.includes("'51866138'"),
    'app.js should keep Maijixian store config'
  );
  assert.ok(
    source.includes("'64822111'"),
    'app.js should define Hongchao store config'
  );
  assert.ok(
    source.includes("wx2f13889e1bd7b040"),
    'app.js should include Hongchao appId'
  );
}

function testIndexUsesStoreSpecificOrderConfig() {
  const source = read('pages/index/index.js');
  assert.ok(
    source.includes('getOrderMiniProgramConfig'),
    'index page should read store-specific order mini program config'
  );
}

function loadBuildOrderMiniPath() {
  const source = read('pages/index/index.js');
  const match = source.match(/function buildOrderMiniPath\(basePath, scanParams, extraStaticQuery\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'should define buildOrderMiniPath in index page');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(match[0] + '\nthis.fn = buildOrderMiniPath;', sandbox);
  return sandbox.fn;
}

function loadOrderLaunchParamsResolver() {
  const source = read('app.js');
  const helperNames = [
    'getKeruyunTableTokenMapping',
    'getOrderLaunchParams'
  ];
  const snippets = helperNames.map((name) => {
    const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'm'));
    assert.ok(match, `should define ${name} in app.js`);
    return match[0];
  });

  const mappingMatch = source.match(/var ORDER_TABLE_TOKEN_MAPPINGS = \{[\s\S]*?\n\};/m);
  assert.ok(mappingMatch, 'should define ORDER_TABLE_TOKEN_MAPPINGS in app.js');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    mappingMatch[0] + '\n' + snippets.join('\n') + '\nthis.fn = getOrderLaunchParams;',
    sandbox
  );
  return sandbox.fn;
}

function testNestedPathCarriesTableInfo() {
  const buildOrderMiniPath = loadBuildOrderMiniPath();
  const result = buildOrderMiniPath(
    'pages/home/index?origin=minpath&path=pages%2Forderfood%2Findex',
    {
      table_id: 'k2',
      store_id: '64822111',
      store_display_name: '洪潮潮汕传统菜'
    },
    {}
  );

  assert.ok(
    result.includes('path=pages%2Forderfood%2Findex%3F'),
    'nested miniprogram path should become an encoded inner route with query parameters'
  );
  assert.ok(
    result.includes('table_id%3Dk2'),
    'nested miniprogram path should pass table_id to the inner order page'
  );
}

function testMajixianD9KeepsVerifiedKeruyunToken() {
  const getOrderLaunchParams = loadOrderLaunchParamsResolver();
  const enriched = getOrderLaunchParams({
    table_id: 'D9',
    store_id: '51866138'
  });

  assert.strictEqual(
    enriched.principalAppId,
    '202410240051534254',
    'D9 should resolve the known Keruyun principalAppId'
  );
  assert.strictEqual(
    enriched.table_token,
    'zBzoNB4IKWeP3hHU23',
    'D9 should resolve the known Keruyun table token'
  );
  assert.strictEqual(
    enriched.keruyun_token,
    'zBzoNB4IKWeP3hHU23',
    'D9 should expose a Keruyun-specific token alias for downstream compatibility testing'
  );
}

function testMajixianA1AddsKeruyunTokenParams() {
  const getOrderLaunchParams = loadOrderLaunchParamsResolver();
  const enriched = getOrderLaunchParams({
    table_id: 'A1',
    store_id: '51866138'
  });

  assert.strictEqual(
    enriched.principalAppId,
    '202410240051534254',
    'A1 should resolve the Keruyun principalAppId'
  );
  assert.strictEqual(
    enriched.table_token,
    '6EQ3h03iy8JVu7xAOt',
    'A1 should resolve the official Keruyun table token from the exported QR package'
  );
}

function testMajixianJdAndOuterTablesExistInAdminList() {
  const source = read('pages/admin/tableCodes/index.js');
  assert.ok(
    source.includes("'外带1'") && source.includes("'外带2'"),
    'admin table list should include the Maijixian takeaway tables from the exported QR package'
  );
  assert.ok(
    source.includes("'外摆1'") && source.includes("'外摆8'"),
    'admin table list should include the Maijixian outside tables from the exported QR package'
  );
}

function testHongchaoK1AddsKeruyunTokenParams() {
  const getOrderLaunchParams = loadOrderLaunchParamsResolver();
  const enriched = getOrderLaunchParams({
    table_id: 'k1',
    store_id: '64822111'
  });

  assert.strictEqual(
    enriched.principalAppId,
    '202505140064702144',
    'k1 should resolve the Keruyun principalAppId for Hongchao'
  );
  assert.strictEqual(
    enriched.table_token,
    '4hztmqQw5EimVhilXD',
    'k1 should resolve the official Hongchao Keruyun table token'
  );
}

function testHongchaoAdminListMatchesExportedTables() {
  const source = read('pages/admin/tableCodes/index.js');
  assert.ok(
    source.includes("'k1'") && source.includes("'k2'"),
    'Hongchao admin table list should use the latest lowercase k tables'
  );
  assert.ok(
    source.includes("'外带1'") && source.includes("'外带2'"),
    'Hongchao admin table list should include the latest takeaway tables'
  );
}

function run() {
  testAppHasPerStoreOrderConfig();
  testIndexUsesStoreSpecificOrderConfig();
  testNestedPathCarriesTableInfo();
  testMajixianD9KeepsVerifiedKeruyunToken();
  testMajixianA1AddsKeruyunTokenParams();
  testMajixianJdAndOuterTablesExistInAdminList();
  testHongchaoK1AddsKeruyunTokenParams();
  testHongchaoAdminListMatchesExportedTables();
  console.log('test-order-mini-routing: ok');
}

run();
