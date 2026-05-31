const crypto = require('crypto')

exports.main = async (event) => {
  // 来自企微的验证请求：GET
  const { msg_signature, timestamp, nonce, echostr } = event.queryStringParameters || {}

  if (!echostr) {
    return { isBase64Encoded: false, statusCode: 400, body: 'missing echostr' }
  }

  // Token 需与企微应用里填的一致
  const TOKEN = 'wecom_callback_2026'

  // 验证签名
  const arr = [TOKEN, timestamp, nonce, echostr].sort()
  const sha1 = crypto.createHash('sha1').update(arr.join('')).digest('hex')

  if (sha1 !== msg_signature) {
    return { isBase64Encoded: false, statusCode: 403, body: 'signature mismatch' }
  }

  // 验证通过，返回 echostr（明文）
  return { isBase64Encoded: false, statusCode: 200, body: echostr }
}
