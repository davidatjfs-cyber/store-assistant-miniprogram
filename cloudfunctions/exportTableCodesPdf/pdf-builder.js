/**
 * 零依赖 PDF 生成器（仅使用 Node.js 内置模块）
 * 用于 exportTableCodesPdf 云函数
 */
const zlib = require('zlib');

function p16(n) { return String.fromCharCode((n >> 8) & 0xFF, n & 0xFF); }

function HexColor(r, g, b) {
  var ri = Math.round(r * 255), gi = Math.round(g * 255), bi = Math.round(b * 255);
  return '[' + (ri / 255).toFixed(3) + ' ' + (gi / 255).toFixed(3) + ' ' + (bi / 255).toFixed(3) + ']';
}

function PDF() {
  this.objs = [];
  this.pages = [];
  this.fonts = {};
  this.images = [];
  this.imageCounter = 0;
}

PDF.prototype.addPage = function (w, h) {
  var page = { id: this.objs.length + 1, width: w || 595.28, height: w ? h || 841.89 : 841.89, content: '' };
  this.pages.push(page);
  this.objs.push(null); // placeholder for page object
  return page;
};

PDF.prototype.addFontHelvetica = function () {
  var name = 'Helvetica';
  if (!this.fonts[name]) {
    this.fonts[name] = { id: this.objs.length + 1, name: name, subtype: 'Type1', base: 'Helvetica' };
    this.objs.push(null);
  }
  return this.fonts[name];
};

PDF.prototype.addFontHelveticaBold = function () {
  var name = 'Helvetica-Bold';
  if (!this.fonts[name]) {
    this.fonts[name] = { id: this.objs.length + 1, name: name, subtype: 'Type1', base: 'Helvetica-Bold' };
    this.objs.push(null);
  }
  return this.fonts[name];
};

PDF.prototype.addImage = function (pngBuffer) {
  // Minimal PNG parser: extract IHDR (dimensions) and IDAT (compressed pixel data)
  var width = 0, height = 0, bitDepth = 0, colorType = 0;
  var idatChunks = [];
  var pos = 8; // skip PNG signature
  while (pos < pngBuffer.length) {
    var length = (pngBuffer[pos] << 24) | (pngBuffer[pos + 1] << 16) | (pngBuffer[pos + 2] << 8) | pngBuffer[pos + 3];
    var type = String.fromCharCode(pngBuffer[pos + 4], pngBuffer[pos + 5], pngBuffer[pos + 6], pngBuffer[pos + 7]);
    var data = pngBuffer.slice(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
      height = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }

  // Decompress PNG pixel data
  var compressed = Buffer.concat(idatChunks);
  var raw = zlib.inflateSync(compressed);
  var samplesPerPixel = (colorType === 6) ? 4 : (colorType === 2) ? 3 : 1;
  var bytesPerRow = 1 + width * samplesPerPixel; // 1 for filter byte

  // Remove PNG row filters to get raw pixels
  var pixels = Buffer.alloc(width * height * 3);
  for (var y = 0; y < height; y++) {
    var rowStart = y * bytesPerRow;
    var filter = raw[rowStart];
    var rowData = raw.slice(rowStart + 1, rowStart + bytesPerRow);
    for (var x = 0; x < width; x++) {
      var srcIdx = x * samplesPerPixel;
      var dstIdx = (y * width + x) * 3;
      if (colorType === 6) { // RGBA
        pixels[dstIdx] = rowData[srcIdx];
        pixels[dstIdx + 1] = rowData[srcIdx + 1];
        pixels[dstIdx + 2] = rowData[srcIdx + 2];
      } else if (colorType === 2) { // RGB
        pixels[dstIdx] = rowData[srcIdx];
        pixels[dstIdx + 1] = rowData[srcIdx + 1];
        pixels[dstIdx + 2] = rowData[srcIdx + 2];
      } else if (colorType === 0) { // Grayscale
        pixels[dstIdx] = rowData[srcIdx];
        pixels[dstIdx + 1] = rowData[srcIdx];
        pixels[dstIdx + 2] = rowData[srcIdx];
      } else if (colorType === 3) { // Indexed - simplified
        pixels[dstIdx] = rowData[srcIdx] || 0;
        pixels[dstIdx + 1] = rowData[srcIdx] || 0;
        pixels[dstIdx + 2] = rowData[srcIdx] || 0;
      }
    }
  }

  // Recompress as RGB for PDF
  var compressedPixels = zlib.deflateSync(pixels);
  this.imageCounter++;
  var img = {
    id: this.objs.length + 1,
    name: 'Im' + this.imageCounter,
    width: width,
    height: height,
    data: compressedPixels
  };
  this.images.push(img);
  this.objs.push(null);
  return img;
};

PDF.prototype.drawRect = function (page, x, y, w, h, options) {
  options = options || {};
  var fillColor = options.fillColor ? HexColor(options.fillColor[0], options.fillColor[1], options.fillColor[2]) : '';
  var borderColor = options.borderColor ? HexColor(options.borderColor[0], options.borderColor[1], options.borderColor[2]) : '';
  var bw = options.borderWidth || 0;
  var ops = '';
  ops += 'q\n';
  ops += bw + ' w\n';
  ops += (fillColor ? fillColor + ' rg\n' : '');
  ops += (borderColor ? borderColor + ' RG\n' : '');
  ops += x + ' ' + y + ' ' + w + ' ' + h + ' re\n';
  ops += 'B\n';
  ops += 'Q\n';
  page.content += ops;
};

PDF.prototype.drawText = function (page, text, x, y, size, fontObj, color) {
  var fontName = fontObj ? fontObj.name : 'Helvetica';
  var r = color ? color[0] : 0, g = color ? color[1] : 0, b = color ? color[2] : 0;
  var escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  page.content += 'BT\n';
  page.content += '/' + fontName + ' ' + size + ' Tf\n';
  page.content += r + ' ' + g + ' ' + b + ' rg\n';
  page.content += x + ' ' + y + ' Td\n';
  page.content += '(' + escaped + ') Tj\n';
  page.content += 'ET\n';
};

PDF.prototype.drawImage = function (page, img, x, y, w, h) {
  page.content += 'q\n';
  page.content += w + ' 0 0 ' + h + ' ' + x + ' ' + y + ' cm\n';
  page.content += '/Im' + img.name.slice(2) + ' Do\n';
  page.content += 'Q\n';
};

PDF.prototype.escapePdfString = function (s) {
  var str = String(s);
  str = str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  return '(' + str + ')';
};

PDF.prototype.save = function () {
  var self = this;
  var pagesObjId = this.objs.length + 1;

  // Build font objects
  var fontList = [];
  for (var k in this.fonts) {
    var f = this.fonts[k];
    f.objNum = this.objs.indexOf(null);
    this.objs[f.objNum] = { type: 'font', data: f };
    fontList.push(f);
  }

  // Build image objects
  for (var i = 0; i < this.images.length; i++) {
    var img = this.images[i];
    img.objNum = this.objs.indexOf(null);
    this.objs[img.objNum] = { type: 'image', data: img };
  }

  // Build page content stream objects + page objects
  var pageObjs = [];
  for (var j = 0; j < this.pages.length; j++) {
    var p = this.pages[j];
    // Content stream
    var contentId = this.objs.length + 1;
    this.objs.push(null);
    var compressedContent = zlib.deflateSync(Buffer.from(p.content, 'ascii'));
    var contentObj = { type: 'content', id: contentId, data: compressedContent };

    // Calculate content obj num
    contentObj.objNum = this.objs.indexOf(null);
    this.objs[contentObj.objNum] = contentObj;

    // Font resources
    var fontDict = '';
    for (var fi = 0; fi < fontList.length; fi++) {
      fontDict += '/F' + (fi + 1) + ' ' + fontList[fi].objNum + ' 0 R ';
    }

    // Image resources
    var imgDict = '';
    for (var ii = 0; ii < this.images.length; ii++) {
      imgDict += '/Im' + (ii + 1) + ' ' + this.images[ii].objNum + ' 0 R ';
    }

    // Page object
    var pageObj = {
      type: 'page', id: this.objs.length + 1,
      data: {
        width: p.width, height: p.height,
        contentId: contentObj.objNum,
        fontDict: fontDict, imgDict: imgDict
      }
    };
    this.objs.push(null);
    pageObj.objNum = this.objs.indexOf(null);
    this.objs[pageObj.objNum] = pageObj;
    pageObjs.push(pageObj);
    p.objNum = pageObj.objNum;
  }

  // Pages object
  var pagesObj = { type: 'pages', id: pagesObjId, kids: pageObjs.map(function (po) { return po.objNum + ' 0 R'; }) };
  pagesObj.objNum = this.objs.indexOf(null);
  this.objs[pagesObj.objNum] = pagesObj;

  // Catalog object
  var catalogId = this.objs.length + 1;
  this.objs.push({ type: 'catalog', id: catalogId, pagesId: pagesObj.objNum });

  // Serialize
  var parts = [];
  var offsets = [];
  parts.push('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  for (var oi = 0; oi < this.objs.length; oi++) {
    var obj = this.objs[oi];
    if (obj === null) continue;
    offsets[oi] = Buffer.byteLength(parts.join(''));

    if (obj.type === 'image') {
      parts.push(oi + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + obj.data.width +
        ' /Height ' + obj.data.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ' +
        obj.data.data.length + ' /Filter /FlateDecode >>\nstream\n');
      parts.push(obj.data.data);
      parts.push('\nendstream\nendobj\n');
    } else if (obj.type === 'font') {
      parts.push(oi + ' 0 obj\n<< /Type /Font /Subtype /' + obj.data.subtype + ' /BaseFont /' + obj.data.base + ' >>\nendobj\n');
    } else if (obj.type === 'content') {
      parts.push(oi + ' 0 obj\n<< /Length ' + obj.data.length + ' /Filter /FlateDecode >>\nstream\n');
      parts.push(obj.data);
      parts.push('\nendstream\nendobj\n');
    } else if (obj.type === 'page') {
      var d = obj.data;
      parts.push(oi + ' 0 obj\n<< /Type /Page /Parent ' + pagesObj.objNum + ' 0 R /MediaBox [0 0 ' +
        d.width + ' ' + d.height + '] /Contents ' + d.contentId + ' 0 R /Resources << /Font << ' +
        d.fontDict + '>> /XObject << ' + d.imgDict + '>> >> >>\nendobj\n');
    } else if (obj.type === 'pages') {
      parts.push(oi + ' 0 obj\n<< /Type /Pages /Kids [' + obj.kids.join(' ') + '] /Count ' + obj.kids.length + ' >>\nendobj\n');
    } else if (obj.type === 'catalog') {
      parts.push(oi + ' 0 obj\n<< /Type /Catalog /Pages ' + obj.pagesId + ' 0 R >>\nendobj\n');
    }
  }

  var body = parts.join('');
  var xrefOffset = Buffer.byteLength(body);

  var xref = 'xref\n0 ' + (this.objs.length + 1) + '\n';
  xref += '0000000000 65535 f \n';
  for (var oi2 = 0; oi2 < this.objs.length; oi2++) {
    var off = offsets[oi2] || 0;
    xref += ('0000000000' + off).slice(-10) + ' 00000 n \n';
  }

  var trailer = 'trailer\n<< /Size ' + (this.objs.length + 1) + ' /Root ' + catalogId + ' 0 R >>\n';
  trailer += 'startxref\n' + xrefOffset + '\n%%EOF\n';

  return Buffer.from(body + xref + trailer, 'binary');
};

module.exports = { PDF: PDF };