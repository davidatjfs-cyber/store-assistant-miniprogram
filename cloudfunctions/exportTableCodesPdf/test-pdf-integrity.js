const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Module = require('module');

// Mock wx-server-sdk
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'wx-server-sdk') {
    return {
      init: () => {},
      database: () => ({
        collection: () => ({
          where: () => ({
            get: () => Promise.resolve({ data: [] })
          })
        })
      }),
      downloadFile: () => Promise.resolve({ fileContent: null }),
      uploadFile: (params) => {
        // 保存生成的 PDF 到本地以便验证
        const outputPath = path.join(__dirname, 'test-output.pdf');
        fs.writeFileSync(outputPath, params.fileContent);
        console.log('PDF 已保存到:', outputPath);
        console.log('PDF 大小:', params.fileContent.length, 'bytes');
        
        // 验证 PDF 结构
        const pdfStr = params.fileContent.toString('binary');
        const hasHeader = pdfStr.startsWith('%PDF-1.4');
        const hasEOF = pdfStr.includes('%%EOF');
        const hasXObject = pdfStr.includes('/Type /XObject');
        const hasImage = pdfStr.includes('/Subtype /Image');
        
        console.log('\nPDF 结构验证:');
        console.log('  ✓ PDF 头部:', hasHeader ? '有效' : '无效');
        console.log('  ✓ EOF 标记:', hasEOF ? '有效' : '无效');
        console.log('  ✓ XObject:', hasXObject ? '存在' : '缺失');
        console.log('  ✓ Image 对象:', hasImage ? '存在' : '缺失');
        
        // 检查 stream 数据
        const streamMatches = pdfStr.match(/stream\n([\s\S]*?)\nendstream/g);
        if (streamMatches) {
          console.log('  ✓ Stream 数量:', streamMatches.length);
          streamMatches.forEach((match, i) => {
            const streamData = match.replace(/stream\n/, '').replace(/\nendstream/, '');
            console.log(`    Stream ${i + 1}: ${streamData.length} bytes`);
          });
        }
        
        return Promise.resolve({ fileID: 'cloud://' + params.cloudPath });
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

// 生成测试 PNG (10x10 红色)
function createTestPNG() {
  const width = 10, height = 10;
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
  const ihdr = createChunk('IHDR', ihdrData);
  
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 3) + 1 + x * 3;
      rawData[offset] = 255; rawData[offset + 1] = 0; rawData[offset + 2] = 0;
    }
  }
  const idat = createChunk('IDAT', zlib.deflateSync(rawData));
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buffer.length; i++) {
    crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 加载并测试
delete require.cache[require.resolve('./index.js')];
const cloudFunc = require('./index.js');

async function runTest() {
  console.log('=== PDF 二进制数据完整性测试 ===\n');
  
  const pngBuffer = createTestPNG();
  console.log('测试 PNG:', pngBuffer.length, 'bytes\n');
  
  const result = await cloudFunc.main({
    store_id: '51866138',
    items: [{ tableId: 'A1', base64: pngBuffer.toString('base64') }]
  }, {});
  
  if (result.success) {
    console.log('\n✓ 测试通过');
    console.log('生成的 PDF 可以用 PDF 阅读器打开验证');
  } else {
    console.log('\n✗ 测试失败:', result.message);
    process.exit(1);
  }
}

runTest().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
