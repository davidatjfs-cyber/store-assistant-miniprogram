var crypto = require('crypto');

// ====== 企微验证配置（与企微后台填写的一致）======
var WE_COM_TOKEN = process.env.WECOM_VERIFY_TOKEN || 'storeassistant2026';
var WE_COM_ENCODING_AES_KEY = process.env.WECOM_ENCODING_AES_KEY || 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
var WE_COM_CORP_ID = process.env.WECOM_CORP_ID || 'wwc4222f318e240468';

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function verifySignature(token, timestamp, nonce, echostr) {
  var arr = [token, timestamp, nonce, echostr].sort();
  return sha1(arr.join(''));
}

function decryptEchoStr(encodingAESKey, echostr) {
  var key = Buffer.from(encodingAESKey + '=', 'base64');
  var iv = key.slice(0, 16);
  var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  var decoded = Buffer.from(echostr, 'base64');
  var decrypted = Buffer.concat([decipher.update(decoded), decipher.final()]);
  var padLen = decrypted[decrypted.length - 1];
  var content = decrypted.slice(16, decrypted.length - padLen).toString('utf8');
  // 前4字节是消息长度，后面是实际内容 + corpId
  var msgLen = content.slice(0, 4).charCodeAt(0) * 16777216 +
               content.slice(1, 2).charCodeAt(0) * 65536 +
               content.slice(2, 3).charCodeAt(0) * 256 +
               content.slice(3, 4).charCodeAt(0);
  var msg = content.slice(4, 4 + msgLen);
  var fromCorpId = content.slice(4 + msgLen);
  return { msg: msg, corpId: fromCorpId };
}

function handleVerification(query) {
  var msgSignature = query.msg_signature || '';
  var timestamp = query.timestamp || '';
  var nonce = query.nonce || '';
  var echostr = query.echostr || '';

  var calculatedSig = verifySignature(WE_COM_TOKEN, timestamp, nonce, echostr);
  if (calculatedSig !== msgSignature) {
    return { success: false, error: '签名验证失败' };
  }

  var decrypted = decryptEchoStr(WE_COM_ENCODING_AES_KEY, echostr);
  if (decrypted.corpId !== WE_COM_CORP_ID) {
    return { success: false, error: 'CorpID不匹配: ' + decrypted.corpId };
  }

  return { success: true, msg: decrypted.msg };
}

exports.main = async function (event, context) {
  console.log('[WecomVerify] 收到请求:', JSON.stringify({
    method: event.httpMethod || event.method,
    path: event.path || event.pathInfo,
    query: event.queryStringParameters || event.queryParameters || {}
  }));

  var query = event.queryStringParameters || event.queryParameters || {};
  var method = (event.httpMethod || event.method || 'GET').toUpperCase();

  // GET 请求：企微 URL 验证
  if (method === 'GET' && query.echostr) {
    var result = handleVerification(query);
    if (result.success) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: result.msg
      };
    } else {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'text/plain' },
        body: result.error
      };
    }
  }

  // POST 请求：接收企微消息（暂不处理）
  if (method === 'POST') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: 'success'
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok', service: 'wecom-verify' })
  };
};
