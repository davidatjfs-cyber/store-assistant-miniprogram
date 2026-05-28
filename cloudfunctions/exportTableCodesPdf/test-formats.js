const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Module = require('module');

// Mock wx-server-sdk before loading the cloud function
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
        uploadedFiles.push({
          path: params.cloudPath,
          size: params.fileContent.length
        });
        return Promise.resolve({ fileID: 'cloud://' + params.cloudPath });
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

// 生成简单的测试 PNG 图片 (10x10 红色方块)
function createTestPNG() {
  const width = 10;
  const height = 10;
  
  // PNG 签名
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);  // width
  ihdrData.writeUInt32BE(height, 4); // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk - 红色像素数据
  const rawData = Buffer.alloc(height * (1 + width * 3)); // filter byte + RGB
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 3) + 1 + x * 3;
      rawData[offset] = 255;     // R
      rawData[offset + 1] = 0;   // G
      rawData[offset + 2] = 0;   // B
    }
  }
  
  const compressedData = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressedData);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

// 生成简单的测试 JPEG 图片 (10x10 蓝色方块)
function createTestJPEG() {
  // 使用最小的有效 JPEG
  // 这是一个 1x1 像素的蓝色 JPEG
  const jpegData = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
    0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
    0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
    0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
    0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
    0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
    0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
    0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
    0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xB8, 0xF8, 0x53, 0xC5,
    0xFF, 0xD9
  ]);
  
  return jpegData;
}

// 创建 PNG chunk
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

// CRC32 计算
function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = [];
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[i] = c;
  }
  
  for (let i = 0; i < buffer.length; i++) {
    crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 模拟微信云环境
let uploadedFiles = [];

// 加载云函数
delete require.cache[require.resolve('./index.js')];
const cloudFunc = require('./index.js');

// 运行测试
async function runTests() {
  console.log('开始测试 PDF 生成功能...\n');
  
  // 生成测试图片
  const pngBuffer = createTestPNG();
  const jpegBuffer = createTestJPEG();
  
  console.log(`生成测试 PNG: ${pngBuffer.length} bytes`);
  console.log(`生成测试 JPEG: ${jpegBuffer.length} bytes\n`);
  
  const testCases = [
    {
      name: 'PNG 图片测试',
      event: {
        store_id: '51866138',
        items: [{ tableId: 'A1', base64: pngBuffer.toString('base64') }]
      }
    },
    {
      name: 'JPEG 图片测试',
      event: {
        store_id: '51866138',
        items: [{ tableId: 'B1', base64: jpegBuffer.toString('base64') }]
      }
    },
    {
      name: '混合格式测试',
      event: {
        store_id: '51866138',
        items: [
          { tableId: 'C1', base64: pngBuffer.toString('base64') },
          { tableId: 'C2', base64: jpegBuffer.toString('base64') }
        ]
      }
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`测试: ${testCase.name}`);
    try {
      uploadedFiles = [];
      const result = await cloudFunc.main(testCase.event, {});
      if (result.success) {
        console.log(`  ✓ 成功 - 生成 ${result.total} 个桌码`);
        console.log(`  ✓ 文件ID: ${result.fileID}`);
        console.log(`  ✓ 上传文件: ${uploadedFiles.length} 个`);
        if (uploadedFiles.length > 0) {
          console.log(`  ✓ 文件大小: ${uploadedFiles[0].size} bytes`);
        }
        passed++;
      } else {
        console.log(`  ✗ 失败 - ${result.message}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ✗ 异常 - ${error.message}`);
      console.log(`     ${error.stack}`);
      failed++;
    }
    console.log('');
  }
  
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
