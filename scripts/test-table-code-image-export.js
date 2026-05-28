const assert = require('assert');
const {
  chunkExportItems,
  buildExportImageName,
  EXPORT_IMAGE_CHUNK_SIZE
} = require('../utils/table-code-export');

function testChunkExportItems() {
  const source = Array.from({ length: EXPORT_IMAGE_CHUNK_SIZE + 2 }, (_, index) => ({ id: 'T' + index }));
  const chunks = chunkExportItems(source, EXPORT_IMAGE_CHUNK_SIZE);
  assert.strictEqual(chunks.length, 2, 'should split export items into multiple image pages');
  assert.strictEqual(chunks[0].length, EXPORT_IMAGE_CHUNK_SIZE, 'first page should use the configured chunk size');
  assert.strictEqual(chunks[1].length, 2, 'remaining items should stay on the last page');
}

function testBuildExportImageName() {
  const name = buildExportImageName('洪潮潮汕传统菜', 1, 3);
  assert.strictEqual(name, 'table-codes-洪潮潮汕传统菜-2of3.png', 'image export name should include store and page sequence');
}

function run() {
  testChunkExportItems();
  testBuildExportImageName();
  console.log('test-table-code-image-export: ok');
}

run();
