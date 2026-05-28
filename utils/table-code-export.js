var EXPORT_IMAGE_CHUNK_SIZE = 6;
var EXPORT_CARD_COLUMNS = 2;
var EXPORT_CARD_ROWS = 3;
var EXPORT_CANVAS_WIDTH = 1080;
var EXPORT_CANVAS_HEIGHT = 1680;
var EXPORT_PAGE_PADDING = 48;
var EXPORT_CARD_GAP = 36;

function chunkExportItems(items, size) {
  var chunkSize = size || EXPORT_IMAGE_CHUNK_SIZE;
  var chunks = [];
  for (var i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function sanitizeFileSegment(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '')
    .slice(0, 24) || 'store';
}

function buildExportImageName(storeName, pageIndex, totalPages) {
  return 'table-codes-' + sanitizeFileSegment(storeName) + '-' + (pageIndex + 1) + 'of' + totalPages + '.png';
}

module.exports = {
  EXPORT_IMAGE_CHUNK_SIZE: EXPORT_IMAGE_CHUNK_SIZE,
  EXPORT_CARD_COLUMNS: EXPORT_CARD_COLUMNS,
  EXPORT_CARD_ROWS: EXPORT_CARD_ROWS,
  EXPORT_CANVAS_WIDTH: EXPORT_CANVAS_WIDTH,
  EXPORT_CANVAS_HEIGHT: EXPORT_CANVAS_HEIGHT,
  EXPORT_PAGE_PADDING: EXPORT_PAGE_PADDING,
  EXPORT_CARD_GAP: EXPORT_CARD_GAP,
  chunkExportItems: chunkExportItems,
  buildExportImageName: buildExportImageName
};
