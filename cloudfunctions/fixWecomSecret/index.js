const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async function() {
  var result = {};

  // 1. Insert Hongchao config
  try {
    await db.collection('store_wecom_configs').doc('hongchao_wecom').set({
      data: {
        store_id: '64822111',
        corp_id: 'ww2d6a3b6a774643e7',
        corp_secret: 'RL4Bt2Q7XQkpyxhJVB9691q3SzTB7U3TXAEZMNB6pMA',
        agent_id: '1000004',
        store_name: '洪潮潮汕传统菜',
        updated_at: db.serverDate()
      }
    });
    result.hongchaoSet = 'ok';
  } catch(e) {
    result.hongchaoError = e.message;
  }

  // 2. Verify both configs
  try {
    var mjx = await db.collection('store_wecom_configs').doc('maijixian_wecom').get();
    result.maijixian = mjx.data;
  } catch(e) { result.maijixianError = e.message; }

  try {
    var hc = await db.collection('store_wecom_configs').doc('hongchao_wecom').get();
    result.hongchao = hc.data;
  } catch(e) { result.hongchaoReadError = e.message; }

  // 3. Test both tokens
  var https = require('https');
  var configs = [
    { label: 'maijixian', corpId: 'wwc4222f318e240468', secret: 'tmoVdCbAzE2xa-8fn5OtY15nng3hDv0b5e-R4Mi6xMo' },
    { label: 'hongchao', corpId: 'ww2d6a3b6a774643e7', secret: 'RL4Bt2Q7XQkpyxhJVB9691q3SzTB7U3TXAEZMNB6pMA' }
  ];

  result.tokenTests = [];
  for (var i = 0; i < configs.length; i++) {
    var c = configs[i];
    var tokenRes = await new Promise(function(resolve) {
      https.get('https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + encodeURIComponent(c.corpId) + '&corpsecret=' + encodeURIComponent(c.secret), function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try { resolve(JSON.parse(data)); }
          catch(e) { resolve({ errcode: -2, errmsg: 'parse error' }); }
        });
      }).on('error', function(e) { resolve({ errcode: -1, errmsg: e.message }); });
    });
    result.tokenTests.push({ label: c.label, errcode: tokenRes.errcode, errmsg: tokenRes.errmsg });
  }

  return result;
};
