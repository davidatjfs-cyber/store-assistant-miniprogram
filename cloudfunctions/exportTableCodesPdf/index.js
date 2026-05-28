/**
 * 导出桌位码 PDF（零外部依赖，单文件自包含）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const zlib = require('zlib');

/* ===================== 内置 PDF 生成器 ===================== */

function PDF() {
  this.objs = [];
  this.pages = [];
  this.fonts = {};
  this.images = [];
  this.imgN = 0;
}

PDF.prototype.addPage = function (w, h) {
  var page = { id: this.objs.length + 1, width: w || 595.28, height: h || 841.89, content: '' };
  this.pages.push(page);
  this.objs.push(null);
  return page;
};

PDF.prototype.addFont = function (name, base) {
  if (!this.fonts[name]) {
    this.fonts[name] = { id: this.objs.length + 1, name: name, base: base };
    this.objs.push(null);
  }
  return this.fonts[name];
};

PDF.prototype.addImage = function (imgBuf) {
  // 检测图片格式
  if (imgBuf.length < 12) throw new Error('图片数据太短');
  
  // PNG 签名: 89 50 4E 47 0D 0A 1A 0A
  const isPNG = imgBuf[0] === 0x89 && imgBuf[1] === 0x50 && imgBuf[2] === 0x4E && imgBuf[3] === 0x47;
  
  // JPEG 签名: FF D8 FF
  const isJPEG = imgBuf[0] === 0xFF && imgBuf[1] === 0xD8 && imgBuf[2] === 0xFF;
  
  if (isPNG) {
    return this.addPNGImage(imgBuf);
  } else if (isJPEG) {
    return this.addJPEGImage(imgBuf);
  } else {
    throw new Error('不支持的图片格式，前8字节: ' + Array.from(imgBuf.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
};

PDF.prototype.addPNGImage = function (pngBuf) {
  var w = 0, h = 0, ct = 0, bd = 0;
  var idats = [];
  var pos = 8;
  
  // 验证 PNG 签名
  if (pngBuf[0] !== 0x89 || pngBuf[1] !== 0x50 || pngBuf[2] !== 0x4E || pngBuf[3] !== 0x47) {
    throw new Error('无效的 PNG 签名');
  }
  
  while (pos + 8 <= pngBuf.length) {
    var len = pngBuf.readUInt32BE(pos);
    var type = pngBuf.toString('ascii', pos + 4, pos + 8);
    if (pos + 12 + len > pngBuf.length) break;
    var data = pngBuf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bd = data[8];
      ct = data[9];
    } else if (type === 'IDAT') { idats.push(data); }
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!w || !h || !idats.length) throw new Error('PNG 解析失败: w=' + w + ' h=' + h + ' idats=' + idats.length);

  var compressed = Buffer.concat(idats);
  var raw;
  try { raw = zlib.inflateSync(compressed); }
  catch (e) { throw new Error('PNG 解压失败: ' + e.message); }

  var spp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  var bpr = 1 + w * spp;
  if (raw.length < h * bpr) throw new Error('PNG 像素数据不足: 需要 ' + (h * bpr) + ' 字节, 实际 ' + raw.length);

  // PNG filter 反滤波
  var unfiltered = Buffer.alloc(w * h * spp);
  for (var y = 0; y < h; y++) {
    var filterType = raw[y * bpr];
    var rowStart = y * bpr + 1;
    var outStart = y * w * spp;
    var prevRowStart = (y - 1) * w * spp;
    for (var x = 0; x < w * spp; x++) {
      var cur = raw[rowStart + x];
      var left = x >= spp ? unfiltered[outStart + x - spp] : 0;
      var up = y > 0 ? unfiltered[prevRowStart + x] : 0;
      var upLeft = (y > 0 && x >= spp) ? unfiltered[prevRowStart + x - spp] : 0;
      var val;
      switch (filterType) {
        case 0: val = cur; break;
        case 1: val = (cur + left) & 0xFF; break;
        case 2: val = (cur + up) & 0xFF; break;
        case 3: val = (cur + Math.floor((left + up) / 2)) & 0xFF; break;
        case 4:
          var p = left + up - upLeft;
          var pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          val = (cur + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xFF;
          break;
        default: val = cur;
      }
      unfiltered[outStart + x] = val;
    }
  }

  // 转 RGB
  var pixels = Buffer.alloc(w * h * 3);
  for (var i = 0; i < w * h; i++) {
    var si = i * spp, di = i * 3;
    if (ct === 6) { pixels[di] = unfiltered[si]; pixels[di + 1] = unfiltered[si + 1]; pixels[di + 2] = unfiltered[si + 2]; }
    else if (ct === 2) { pixels[di] = unfiltered[si]; pixels[di + 1] = unfiltered[si + 1]; pixels[di + 2] = unfiltered[si + 2]; }
    else if (ct === 4) { pixels[di] = unfiltered[si]; pixels[di + 1] = unfiltered[si]; pixels[di + 2] = unfiltered[si]; }
    else { pixels[di] = unfiltered[si]; pixels[di + 1] = unfiltered[si]; pixels[di + 2] = unfiltered[si]; }
  }

  var compressedPixels = zlib.deflateSync(pixels);
  this.imgN++;
  var img = { id: this.objs.length + 1, name: 'Im' + this.imgN, width: w, height: h, data: compressedPixels, format: 'png' };
  this.images.push(img);
  this.objs.push(null);
  return img;
};

PDF.prototype.addJPEGImage = function (jpegBuf) {
  // 解析 JPEG 获取尺寸
  var w = 0, h = 0;
  var pos = 2; // 跳过 FF D8
  
  while (pos < jpegBuf.length - 1) {
    if (jpegBuf[pos] !== 0xFF) { pos++; continue; }
    
    var marker = jpegBuf[pos + 1];
    
    // SOF markers (Start of Frame)
    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
      if (pos + 9 < jpegBuf.length) {
        h = jpegBuf.readUInt16BE(pos + 5);
        w = jpegBuf.readUInt16BE(pos + 7);
        break;
      }
    }
    
    // 跳过 marker 段
    if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
      pos += 2;
    } else {
      if (pos + 3 < jpegBuf.length) {
        var segLen = jpegBuf.readUInt16BE(pos + 2);
        pos += 2 + segLen;
      } else {
        break;
      }
    }
  }
  
  if (!w || !h) throw new Error('JPEG 解析失败: 无法获取尺寸 w=' + w + ' h=' + h);
  
  this.imgN++;
  var img = { id: this.objs.length + 1, name: 'Im' + this.imgN, width: w, height: h, data: jpegBuf, format: 'jpeg' };
  this.images.push(img);
  this.objs.push(null);
  return img;
};

PDF.prototype.drawRect = function (page, x, y, w, h, fill, border, bw) {
  var fc = fill ? '[' + fill[0].toFixed(3) + ' ' + fill[1].toFixed(3) + ' ' + fill[2].toFixed(3) + '] rg\n' : '';
  var bc = border ? '[' + border[0].toFixed(3) + ' ' + border[1].toFixed(3) + ' ' + border[2].toFixed(3) + '] RG\n' : '';
  var lw = (bw || 0) + ' w\n';
  page.content += 'q\n' + lw + fc + bc + x + ' ' + y + ' ' + w + ' ' + h + ' re\nB\nQ\n';
};

PDF.prototype.drawText = function (page, text, x, y, size, fontName, color) {
  var r = color ? color[0] : 0, g = color ? color[1] : 0, b = color ? color[2] : 0;
  var esc = String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  page.content += 'BT\n/' + fontName + ' ' + size + ' Tf\n' + r + ' ' + g + ' ' + b + ' rg\n' + x + ' ' + y + ' Td\n(' + esc + ') Tj\nET\n';
};

PDF.prototype.drawImage = function (page, img, x, y, w, h) {
  page.content += 'q\n' + w + ' 0 0 ' + h + ' ' + x + ' ' + y + ' cm\n/' + img.name + ' Do\nQ\n';
};

PDF.prototype.save = function () {
  var self = this;
  var fontList = [];
  for (var k in this.fonts) {
    var f = this.fonts[k];
    f.objNum = this.objs.indexOf(null);
    this.objs[f.objNum] = f;
    fontList.push(f);
  }
  for (var i = 0; i < this.images.length; i++) {
    var img = this.images[i];
    img.objNum = this.objs.indexOf(null);
    this.objs[img.objNum] = img;
  }
  var pageObjs = [];
  for (var j = 0; j < this.pages.length; j++) {
    var p = this.pages[j];
    var contentId = this.objs.length + 1;
    this.objs.push(null);
    var cc = zlib.deflateSync(Buffer.from(p.content, 'ascii'));
    var cObj = { type: 'content', id: contentId, data: cc };
    cObj.objNum = this.objs.indexOf(null);
    this.objs[cObj.objNum] = cObj;

    var fd = '', xd = '';
    for (var fi = 0; fi < fontList.length; fi++) fd += '/F' + (fi + 1) + ' ' + fontList[fi].objNum + ' 0 R ';
    for (var ii = 0; ii < this.images.length; ii++) xd += '/Im' + (ii + 1) + ' ' + this.images[ii].objNum + ' 0 R ';

    var po = { type: 'page', id: this.objs.length + 1, data: { width: p.width, height: p.height, contentId: cObj.objNum, fontDict: fd, imgDict: xd } };
    this.objs.push(null);
    po.objNum = this.objs.indexOf(null);
    this.objs[po.objNum] = po;
    pageObjs.push(po);
    p.objNum = po.objNum;
  }

  var pagesObj = { type: 'pages', id: this.objs.length + 1, kids: pageObjs.map(function (po) { return po.objNum + ' 0 R'; }) };
  pagesObj.objNum = this.objs.indexOf(null);
  this.objs[pagesObj.objNum] = pagesObj;

  var catId = this.objs.length + 1;
  this.objs.push({ type: 'catalog', id: catId, pagesId: pagesObj.objNum });

  var parts = [];
  var offsets = {};
  parts.push('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  for (var oi = 0; oi < this.objs.length; oi++) {
    var obj = this.objs[oi];
    if (!obj) continue;
    var off = Buffer.byteLength(parts.join(''));
    if (obj.type === 'content') {
      parts.push(oi + ' 0 obj\n<< /Length ' + obj.data.length + ' /Filter /FlateDecode >>\nstream\n');
      offsets[oi] = off;
      parts.push(obj.data);
      parts.push('\nendstream\nendobj\n');
    } else if (obj.name && obj.name.indexOf('Im') === 0) {
      // 根据图片格式选择 Filter
      var filter = obj.format === 'jpeg' ? '/DCTDecode' : '/FlateDecode';
      parts.push(oi + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + obj.width + ' /Height ' + obj.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ' + obj.data.length + ' ' + filter + ' >>\nstream\n');
      offsets[oi] = off;
      parts.push(obj.data);
      parts.push('\nendstream\nendobj\n');
    } else if (obj.name && (obj.name === 'Helvetica' || obj.name === 'Helvetica-Bold')) {
      parts.push(oi + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /' + obj.base + ' >>\nendobj\n');
      offsets[oi] = off;
    } else if (obj.type === 'page') {
      var d = obj.data;
      parts.push(oi + ' 0 obj\n<< /Type /Page /Parent ' + pagesObj.objNum + ' 0 R /MediaBox [0 0 ' + d.width + ' ' + d.height + '] /Contents ' + d.contentId + ' 0 R /Resources << /Font << ' + d.fontDict + '>> /XObject << ' + d.imgDict + '>> >> >>\nendobj\n');
      offsets[oi] = off;
    } else if (obj.type === 'pages') {
      parts.push(oi + ' 0 obj\n<< /Type /Pages /Kids [' + obj.kids.join(' ') + '] /Count ' + obj.kids.length + ' >>\nendobj\n');
      offsets[oi] = off;
    } else if (obj.type === 'catalog') {
      parts.push(oi + ' 0 obj\n<< /Type /Catalog /Pages ' + obj.pagesId + ' 0 R >>\nendobj\n');
      offsets[oi] = off;
    } else {
      offsets[oi] = off;
    }
  }

  var body = parts.join('');
  var xrefOff = Buffer.byteLength(body);
  var xref = 'xref\n0 ' + (this.objs.length + 1) + '\n0000000000 65535 f \n';
  for (var oi2 = 0; oi2 < this.objs.length; oi2++) {
    var o = offsets[oi2] || 0;
    xref += ('0000000000' + o).slice(-10) + ' 00000 n \n';
  }
  return Buffer.from(body + xref + 'trailer\n<< /Size ' + (this.objs.length + 1) + ' /Root ' + catId + ' 0 R >>\nstartxref\n' + xrefOff + '\n%%EOF\n', 'binary');
};

/* ===================== 常量 ===================== */

var PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 28, GAP = 18, COLS = 2, ROWS = 2;
var CARD_W = (PAGE_W - MARGIN * 2 - GAP) / COLS;
var CARD_H = (PAGE_H - MARGIN * 2 - GAP) / ROWS;
var LABELS = { '51866138': 'MAJIXIAN GUANGDONG', '64822111': 'HONGCHAO CHAOSHAN' };

function cardPos(idx) {
  return { x: MARGIN + (idx % COLS) * (CARD_W + GAP), y: PAGE_H - MARGIN - (Math.floor(idx / COLS) + 1) * CARD_H - Math.floor(idx / COLS) * GAP };
}
function label(t) { return String(t || '').replace(/外摆/g, 'WB').replace(/外带/g, 'TAKE').replace(/[^\x20-\x7E]/g, '').trim() || 'TABLE'; }

/* ===================== 入口 ===================== */

exports.main = async function (event, context) {
  try {
    var storeId = String(event.store_id || '51866138');
    var slabel = LABELS[storeId] || 'TABLE QR';
    var tables = event.tables || [], items = event.items || [];

    var exportItems = [];
    if (items.length) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        var tid = String(it.tableId || it.table_id || '').trim();
        var b64 = String(it.base64 || '').trim();
        if (tid && b64) exportItems.push({ tableId: tid, label: label(tid), base64: b64 });
      }
    } else if (tables.length) {
      var seen = {};
      var tids = [];
      for (var ti = 0; ti < tables.length; ti++) { var t = String(tables[ti] || '').trim(); if (t && !seen[t]) { seen[t] = true; tids.push(t); } }
      var recs = [];
      for (var s = 0; s < tids.length; s += 20) {
        var batch = tids.slice(s, s + 20);
        var r = await db.collection('table_qrcodes').where({ store_id: storeId, table_id: _.in(batch) }).get();
        if (r && r.data) { for (var ri = 0; ri < r.data.length; ri++) recs.push(r.data[ri]); }
      }
      var rmap = {};
      for (var ri2 = 0; ri2 < recs.length; ri2++) rmap[recs[ri2].table_id] = recs[ri2];
      var missing = [];
      for (var ti2 = 0; ti2 < tids.length; ti2++) {
        var rec = rmap[tids[ti2]];
        var b64 = rec && rec.base64 ? rec.base64 : '';
        var fid = rec && rec.file_id ? rec.file_id : '';
        if (!b64 && !fid) { missing.push(tids[ti2]); continue; }
        exportItems.push({ tableId: tids[ti2], label: label(tids[ti2]), base64: b64, fileId: fid });
      }
      if (missing.length) return { success: false, message: '以下桌码未缓存，请先生成：' + missing.join('\u3001') };
    } else {
      return { success: false, message: '缺少参数' };
    }
    if (!exportItems.length) return { success: false, message: '没有可导出的桌码' };

    var pdf = new PDF();
    var h = pdf.addFont('Helvetica', 'Helvetica');
    var hb = pdf.addFont('Helvetica-Bold', 'Helvetica-Bold');
    var qs = Math.min(CARD_W - 52, 180);

    for (var ei = 0; ei < exportItems.length; ei++) {
      var ip = ei % (COLS * ROWS);
      if (ip === 0) pdf.addPage(PAGE_W, PAGE_H);
      var page = pdf.pages[pdf.pages.length - 1];
      var item = exportItems[ei];
      var pos = cardPos(ip);

      var buf = item.base64 ? Buffer.from(item.base64, 'base64') : ((item.fileId ? (await cloud.downloadFile({ fileID: item.fileId })).fileContent : null));
      if (!buf) continue;
      var img = pdf.addImage(buf);

      pdf.drawRect(page, pos.x, pos.y, CARD_W, CARD_H, [0.988, 0.969, 0.929], [0.78, 0.66, 0.44], 1.2);
      pdf.drawText(page, slabel, pos.x + 18, pos.y + CARD_H - 32, 16, 'Helvetica-Bold', [0.16, 0.12, 0.08]);
      pdf.drawText(page, 'TABLE QR CODE', pos.x + 18, pos.y + CARD_H - 56, 11, 'Helvetica', [0.52, 0.42, 0.28]);
      pdf.drawImage(page, img, pos.x + (CARD_W - qs) / 2, pos.y + 72, qs, qs);
      pdf.drawText(page, item.label, pos.x + 18, pos.y + 44, 24, 'Helvetica-Bold', [0.16, 0.12, 0.08]);
      pdf.drawText(page, 'Scan to order', pos.x + 18, pos.y + 20, 10, 'Helvetica', [0.48, 0.42, 0.36]);
    }

    var pdfBuffer = pdf.save();
    var fname = 'table-codes-' + Date.now() + '.pdf';
    var upRes = await cloud.uploadFile({ cloudPath: 'exports/table-codes/' + storeId + '/' + fname, fileContent: pdfBuffer });
    return { success: true, fileID: upRes.fileID, filename: fname, total: exportItems.length };
  } catch (e) {
    return { success: false, message: 'PDF生成异常: ' + (e.message || e) };
  }
};