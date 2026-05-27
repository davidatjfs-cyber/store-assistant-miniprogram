const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

function run() {
  testAppHasPerStoreOrderConfig();
  testIndexUsesStoreSpecificOrderConfig();
  console.log('test-order-mini-routing: ok');
}

run();
