const cloud = require('wx-server-sdk');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 28;
const CARD_GAP = 18;
const CARD_COLS = 2;
const CARD_ROWS = 2;

const STORE_LABELS = {
  '51866138': 'MAJIXIAN GUANGDONG',
  '64822111': 'HONGCHAO CHAOSHAN'
};

function computeCardPosition(indexOnPage, cardWidth, cardHeight) {
  const col = indexOnPage % CARD_COLS;
  const row = Math.floor(indexOnPage / CARD_COLS);
  const x = PAGE_MARGIN + col * (cardWidth + CARD_GAP);
  const y = PAGE_HEIGHT - PAGE_MARGIN - (row + 1) * cardHeight - row * CARD_GAP;
  return { x, y };
}

function detectImageFormat(buffer) {
  if (buffer && buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer && buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff) {
    return 'jpg';
  }
  return 'unknown';
}

function normalizeLabel(tableId) {
  const raw = String(tableId || '').trim();
  if (!raw) return 'TABLE';
  return raw
    .replace(/外摆/g, 'WB')
    .replace(/外带/g, 'TAKE')
    .replace(/[^\x20-\x7E]/g, '')
    .trim() || 'TABLE';
}

async function embedQrImage(pdfDoc, base64) {
  const imageBuffer = Buffer.from(base64, 'base64');
  return embedQrImageBuffer(pdfDoc, imageBuffer);
}

async function embedQrImageBuffer(pdfDoc, imageBuffer) {
  const format = detectImageFormat(imageBuffer);
  if (format === 'png') return pdfDoc.embedPng(imageBuffer);
  if (format === 'jpg') return pdfDoc.embedJpg(imageBuffer);
  throw new Error('不支持的桌码图片格式');
}

async function loadExistingByTables(storeId, tables) {
  const tableIds = [];
  const seen = {};
  for (let i = 0; i < tables.length; i++) {
    const tableId = String(tables[i] || '').trim();
    if (!tableId || seen[tableId]) continue;
    seen[tableId] = true;
    tableIds.push(tableId);
  }

  const records = [];
  for (let start = 0; start < tableIds.length; start += 20) {
    const batch = tableIds.slice(start, start + 20);
    try {
      const res = await db.collection('table_qrcodes').where({
        store_id: storeId,
        table_id: _.in(batch)
      }).get();
      if (res && res.data && res.data.length) {
        records.push.apply(records, res.data);
      }
    } catch (err) {
      return [];
    }
  }
  return records;
}

exports.main = async (event) => {
  const storeId = String(event.store_id || '51866138');
  const storeLabel = STORE_LABELS[storeId] || 'TABLE QR CODES';
  const tables = Array.isArray(event.tables) ? event.tables : [];
  const items = Array.isArray(event.items) ? event.items : [];

  const exportItems = [];
  if (items.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const tableId = String(item.tableId || item.table_id || '').trim();
      const base64 = String(item.base64 || '').trim();
      if (!tableId || !base64) continue;
      exportItems.push({
        tableId,
        label: normalizeLabel(tableId),
        base64
      });
    }
  } else if (tables.length) {
    const records = await loadExistingByTables(storeId, tables);
    const recordMap = {};
    for (let i = 0; i < records.length; i++) {
      recordMap[records[i].table_id] = records[i];
    }
    const missingTables = [];

    for (let i = 0; i < tables.length; i++) {
      const tableId = String(tables[i] || '').trim();
      if (!tableId) continue;
      const record = recordMap[tableId];
      const base64 = record && record.base64 ? record.base64 : '';
      const fileId = record && record.file_id ? record.file_id : '';
      if (!base64 && !fileId) {
        missingTables.push(tableId);
        continue;
      }
      exportItems.push({
        tableId,
        label: normalizeLabel(tableId),
        base64,
        fileId
      });
    }

    if (missingTables.length) {
      return {
        success: false,
        message: '以下桌码未找到已生成缓存，请先重新生成后再导出：' + missingTables.join('、')
      };
    }
  } else {
    return { success: false, message: '请传入要导出的桌码数据' };
  }

  if (!exportItems.length) {
    return { success: false, message: '没有可导出的已生成桌码' };
  }

  const pdfDoc = await PDFDocument.create();
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const cardWidth = (PAGE_WIDTH - PAGE_MARGIN * 2 - CARD_GAP) / CARD_COLS;
  const cardHeight = (PAGE_HEIGHT - PAGE_MARGIN * 2 - CARD_GAP) / CARD_ROWS;
  const qrSize = Math.min(cardWidth - 52, 180);

  for (let i = 0; i < exportItems.length; i++) {
    const indexOnPage = i % (CARD_COLS * CARD_ROWS);
    if (indexOnPage === 0) {
      pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    }
    const page = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
    const item = exportItems[i];
    const pos = computeCardPosition(indexOnPage, cardWidth, cardHeight);
    let qrImage;
    if (item.base64) {
      qrImage = await embedQrImage(pdfDoc, item.base64);
    } else if (item.fileId) {
      const downloadRes = await cloud.downloadFile({ fileID: item.fileId });
      qrImage = await embedQrImageBuffer(pdfDoc, downloadRes.fileContent);
    } else {
      throw new Error('桌码图片缓存缺失');
    }

    page.drawRectangle({
      x: pos.x,
      y: pos.y,
      width: cardWidth,
      height: cardHeight,
      color: rgb(0.988, 0.969, 0.929),
      borderColor: rgb(0.78, 0.66, 0.44),
      borderWidth: 1.2
    });

    page.drawText(storeLabel, {
      x: pos.x + 18,
      y: pos.y + cardHeight - 30,
      size: 16,
      font: titleFont,
      color: rgb(0.16, 0.12, 0.08)
    });

    page.drawText('TABLE QR CODE', {
      x: pos.x + 18,
      y: pos.y + cardHeight - 54,
      size: 11,
      font: bodyFont,
      color: rgb(0.52, 0.42, 0.28)
    });

    page.drawImage(qrImage, {
      x: pos.x + (cardWidth - qrSize) / 2,
      y: pos.y + 72,
      width: qrSize,
      height: qrSize
    });

    page.drawText(item.label, {
      x: pos.x + 18,
      y: pos.y + 44,
      size: 24,
      font: titleFont,
      color: rgb(0.16, 0.12, 0.08)
    });

    page.drawText('Scan to order', {
      x: pos.x + 18,
      y: pos.y + 20,
      size: 10,
      font: bodyFont,
      color: rgb(0.48, 0.42, 0.36)
    });
  }

  const pdfBytes = await pdfDoc.save();
  const timestamp = Date.now();
  const filename = 'table-codes-' + timestamp + '.pdf';
  const cloudPath = 'exports/table-codes/' + storeId + '/' + filename;
  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(pdfBytes)
  });

  return {
    success: true,
    fileID: uploadRes.fileID,
    filename,
    total: exportItems.length
  };
};
