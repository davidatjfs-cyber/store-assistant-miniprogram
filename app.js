// app.js
//
// 云环境 ID 必须属于「当前小程序」在云开发里开通的环境。
// 若写错或沿用其他项目的 env，会报错：errCode -501000 | env status is isolated
//
// 获取方式：登录 mp.weixin.qq.com → 开发 → 云开发 → 右上角「设置」或环境列表里复制「环境 ID」
var CLOUD_ENV_ID = 'cloud1-2gqo1169d58023d7'; // 例如 'cloud1-AbcDef'；留空则使用本小程序默认云环境（仅当已在云开发里创建过环境）
var DEFAULT_STORE_ID = '51866138';
var ORDER_MINI_PROGRAM_CONFIGS = {
  '51866138': {
    appId: 'wxdaa8741d326cf971',
    path: 'pages/home/index?origin=minpath&path=pages%2Forderfood%2Findex',
    envVersion: 'release',
    extraStaticQuery: {},
    extraData: undefined
  },
  '64822111': {
    appId: 'wx2f13889e1bd7b040',
    path: 'pages/home/index?origin=minpath&path=pages%2Forderfood%2Findex',
    envVersion: 'release',
    extraStaticQuery: {},
    extraData: undefined
  }
};
var ORDER_TABLE_TOKEN_MAPPINGS = {
  '51866138': {
    'A1': {
      principalAppId: '202410240051534254',
      token: '6EQ3h03iy8JVu7xAOt',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/6EQ3h03iy8JVu7xAOt'
    },
    'A2': {
      principalAppId: '202410240051534254',
      token: 'xedmBQlYSE4ZBOLKXA',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/xedmBQlYSE4ZBOLKXA'
    },
    'A3': {
      principalAppId: '202410240051534254',
      token: 'hn3rpgUFSHtUprOng1',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/hn3rpgUFSHtUprOng1'
    },
    'A5': {
      principalAppId: '202410240051534254',
      token: 'LoyE0zx2y9kz6u2GCx',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/LoyE0zx2y9kz6u2GCx'
    },
    'A6': {
      principalAppId: '202410240051534254',
      token: 'hjjNgY0QW8ZpIeJwuS',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/hjjNgY0QW8ZpIeJwuS'
    },
    'A8': {
      principalAppId: '202410240051534254',
      token: '1YLjNqQC6NGI7cKKRh',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/1YLjNqQC6NGI7cKKRh'
    },
    'A9': {
      principalAppId: '202410240051534254',
      token: 'bn4qZmI6NOJu8aJMk4',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/bn4qZmI6NOJu8aJMk4'
    },
    'A10': {
      principalAppId: '202410240051534254',
      token: 'RJpcjsqCCYXmSFIXmv',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/RJpcjsqCCYXmSFIXmv'
    },
    'A11': {
      principalAppId: '202410240051534254',
      token: 'fDvRN4qZpasI6tfn02',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/fDvRN4qZpasI6tfn02'
    },
    'A12': {
      principalAppId: '202410240051534254',
      token: 'VU3rSfDWppirK6b5bb',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/VU3rSfDWppirK6b5bb'
    },
    'A13': {
      principalAppId: '202410240051534254',
      token: 'MvsQSWwbbeft73i3Je',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/MvsQSWwbbeft73i3Je'
    },
    'B1': {
      principalAppId: '202410240051534254',
      token: 'LqlyYpMpfV1R6r1lpw',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/LqlyYpMpfV1R6r1lpw'
    },
    'B2': {
      principalAppId: '202410240051534254',
      token: 'VW785TlGu7OOFiai0Y',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/VW785TlGu7OOFiai0Y'
    },
    'B3': {
      principalAppId: '202410240051534254',
      token: '3eE64qEU0pKd6QWTkV',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/3eE64qEU0pKd6QWTkV'
    },
    'B5': {
      principalAppId: '202410240051534254',
      token: 'HMFPUehAudBoCTbxkB',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/HMFPUehAudBoCTbxkB'
    },
    'B6': {
      principalAppId: '202410240051534254',
      token: 'p2TtAZUJaw4LLY5n2L',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/p2TtAZUJaw4LLY5n2L'
    },
    'B8': {
      principalAppId: '202410240051534254',
      token: 'XBXivgp3QNk4CemyTy',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/XBXivgp3QNk4CemyTy'
    },
    'B9': {
      principalAppId: '202410240051534254',
      token: 'yQmr8uRY6210NNtY4u',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/yQmr8uRY6210NNtY4u'
    },
    'B10': {
      principalAppId: '202410240051534254',
      token: 'xeQrWbF9B36eTOP5xW',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/xeQrWbF9B36eTOP5xW'
    },
    'B11': {
      principalAppId: '202410240051534254',
      token: 'lZLgKi1St5SXmgPgZH',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/lZLgKi1St5SXmgPgZH'
    },
    'B12': {
      principalAppId: '202410240051534254',
      token: 'V6BnIaniJKCbHVuT8i',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/V6BnIaniJKCbHVuT8i'
    },
    'C1': {
      principalAppId: '202410240051534254',
      token: 'teVpJqQc0q3RqfHOeV',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/teVpJqQc0q3RqfHOeV'
    },
    'C2': {
      principalAppId: '202410240051534254',
      token: 'DMrNUZeEo52O0HIiVz',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/DMrNUZeEo52O0HIiVz'
    },
    'C3': {
      principalAppId: '202410240051534254',
      token: '3IU3sUcqMrtxLe3B7Q',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/3IU3sUcqMrtxLe3B7Q'
    },
    'C5': {
      principalAppId: '202410240051534254',
      token: 'GjomJs57PkM37fJ4nZ',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/GjomJs57PkM37fJ4nZ'
    },
    'C6': {
      principalAppId: '202410240051534254',
      token: 'HukCxYVCwPpOO7K2Ft',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/HukCxYVCwPpOO7K2Ft'
    },
    'C8': {
      principalAppId: '202410240051534254',
      token: 'cr7mJTwuoh9ye7KvWU',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/cr7mJTwuoh9ye7KvWU'
    },
    'C9': {
      principalAppId: '202410240051534254',
      token: 'mkVtqZ5llp7lzxZEM7',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/mkVtqZ5llp7lzxZEM7'
    },
    'C10': {
      principalAppId: '202410240051534254',
      token: 'DayA9YAfZa4CqiSckf',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/DayA9YAfZa4CqiSckf'
    },
    'D1': {
      principalAppId: '202410240051534254',
      token: 'wCTTFUet549Nb00Qfp',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/wCTTFUet549Nb00Qfp'
    },
    'D2': {
      principalAppId: '202410240051534254',
      token: '2eUs4fMfL5HGKPBmhL',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/2eUs4fMfL5HGKPBmhL'
    },
    'D3': {
      principalAppId: '202410240051534254',
      token: 'Z6uxw2N6pjMMtVlkmY',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/Z6uxw2N6pjMMtVlkmY'
    },
    'D5': {
      principalAppId: '202410240051534254',
      token: 'LVWsyxDnWcVcHxHnAb',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/LVWsyxDnWcVcHxHnAb'
    },
    'D6': {
      principalAppId: '202410240051534254',
      token: 'Vs1ReMz0UiXmdj6cKc',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/Vs1ReMz0UiXmdj6cKc'
    },
    'D8': {
      principalAppId: '202410240051534254',
      token: '9xcD7BFSBjuPZr4zb8',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/9xcD7BFSBjuPZr4zb8'
    },
    'D9': {
      principalAppId: '202410240051534254',
      token: 'zBzoNB4IKWeP3hHU23',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/zBzoNB4IKWeP3hHU23'
    },
    '外带1': {
      principalAppId: '202410240051534254',
      token: '0nJVWC87rbeHoSL7QA',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/0nJVWC87rbeHoSL7QA'
    },
    '外带2': {
      principalAppId: '202410240051534254',
      token: 'gPYJLKFyabR8Hzfamx',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/gPYJLKFyabR8Hzfamx'
    },
    '外摆1': {
      principalAppId: '202410240051534254',
      token: 'GtyIJPxxUwj9FeyLXi',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/GtyIJPxxUwj9FeyLXi'
    },
    '外摆2': {
      principalAppId: '202410240051534254',
      token: 'hDP8tsj5tuV0XdOY17',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/hDP8tsj5tuV0XdOY17'
    },
    '外摆3': {
      principalAppId: '202410240051534254',
      token: '4z0KcUdqxcnmwGAAEO',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/4z0KcUdqxcnmwGAAEO'
    },
    '外摆5': {
      principalAppId: '202410240051534254',
      token: 'big7UTY56dIz3RM0UI',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/big7UTY56dIz3RM0UI'
    },
    '外摆6': {
      principalAppId: '202410240051534254',
      token: 'yF2vktTNLZILSnQYce',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/yF2vktTNLZILSnQYce'
    },
    '外摆8': {
      principalAppId: '202410240051534254',
      token: 's7Sj2uvOrwEXGstBuV',
      qrUrl: 'https://qrse.keruyun.com/p/mini/11/6/202410240051534254/s7Sj2uvOrwEXGstBuV'
    }
  },
  '64822111': {
    'V1': {
      principalAppId: '202505140064702144',
      token: 'hnKSjk6p5XIj6hBZL0',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/hnKSjk6p5XIj6hBZL0'
    },
    'V2': {
      principalAppId: '202505140064702144',
      token: 'GUe2xdk701nwlIumGH',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/GUe2xdk701nwlIumGH'
    },
    'k1': {
      principalAppId: '202505140064702144',
      token: '4hztmqQw5EimVhilXD',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/4hztmqQw5EimVhilXD'
    },
    'k2': {
      principalAppId: '202505140064702144',
      token: 'tfSYnIzyVwW9Cxicv3',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/tfSYnIzyVwW9Cxicv3'
    },
    '101': {
      principalAppId: '202505140064702144',
      token: 'qqhrPiK8PfbRcODk7a',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/qqhrPiK8PfbRcODk7a'
    },
    '102': {
      principalAppId: '202505140064702144',
      token: 'wq64tqT6gY49LwiVtm',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/wq64tqT6gY49LwiVtm'
    },
    '103': {
      principalAppId: '202505140064702144',
      token: 'mGSUuEMXt5pkEhbZOl',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/mGSUuEMXt5pkEhbZOl'
    },
    '201': {
      principalAppId: '202505140064702144',
      token: 'YdvRTboGdZ0MfHgSft',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/YdvRTboGdZ0MfHgSft'
    },
    '202': {
      principalAppId: '202505140064702144',
      token: '7YBCMRNyGmYeqrLZkW',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/7YBCMRNyGmYeqrLZkW'
    },
    '203': {
      principalAppId: '202505140064702144',
      token: 'GUZXl0fTmMg8wv67M2',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/GUZXl0fTmMg8wv67M2'
    },
    '301': {
      principalAppId: '202505140064702144',
      token: '2vfzQqPJjmizqUo7cp',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/2vfzQqPJjmizqUo7cp'
    },
    '302': {
      principalAppId: '202505140064702144',
      token: 'hLnIAnH7YPFVgWC6e8',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/hLnIAnH7YPFVgWC6e8'
    },
    '303': {
      principalAppId: '202505140064702144',
      token: 'btouoSMNVrdHQPBVQF',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/btouoSMNVrdHQPBVQF'
    },
    '305': {
      principalAppId: '202505140064702144',
      token: 'R718EvQ6FHEYoUYiJ9',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/R718EvQ6FHEYoUYiJ9'
    },
    '501': {
      principalAppId: '202505140064702144',
      token: 'yzHfzQZM1WvgxX5iUS',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/yzHfzQZM1WvgxX5iUS'
    },
    '502': {
      principalAppId: '202505140064702144',
      token: 'ktaIlA2b0ztgBkx6de',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/ktaIlA2b0ztgBkx6de'
    },
    '503': {
      principalAppId: '202505140064702144',
      token: 'YoP4AaO0yjkbnxYIvf',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/YoP4AaO0yjkbnxYIvf'
    },
    '601': {
      principalAppId: '202505140064702144',
      token: 'wNDJRGRTGU5NrOBMJH',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/wNDJRGRTGU5NrOBMJH'
    },
    '602': {
      principalAppId: '202505140064702144',
      token: 'tiJMOSYLDkCPdxTsPx',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/tiJMOSYLDkCPdxTsPx'
    },
    '外带1': {
      principalAppId: '202505140064702144',
      token: 'vN8e2w9Q0IxOm6wYF8',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/vN8e2w9Q0IxOm6wYF8'
    },
    '外带2': {
      principalAppId: '202505140064702144',
      token: 'yISLnB0nlBD98GTSV3',
      qrUrl: 'https://qrse.keruyun.com/p/mini/30/21/202505140064702144/yISLnB0nlBD98GTSV3'
    }
  }
};

function getKeruyunTableTokenMapping(storeId, tableId) {
  var sid = storeId != null ? String(storeId).trim() : '';
  var tid = tableId != null ? String(tableId).trim() : '';
  if (!sid || !tid) return null;
  var storeMappings = ORDER_TABLE_TOKEN_MAPPINGS[sid];
  if (!storeMappings) return null;
  return storeMappings[tid] || storeMappings[tid.toUpperCase()] || storeMappings[tid.toLowerCase()] || null;
}

function getOrderLaunchParams(scanParams) {
  var params = Object.assign({}, scanParams || {});
  var mapping = getKeruyunTableTokenMapping(params.store_id, params.table_id);
  if (!mapping) return params;

  params.principalAppId = mapping.principalAppId;
  params.table_token = mapping.token;
  params.desk_token = mapping.token;
  params.keruyun_token = mapping.token;
  params.keruyun_qr_url = mapping.qrUrl;
  return params;
}

App({
  onLaunch: function (options) {
    // 检查云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      var initOpts = { traceUser: true };
      if (CLOUD_ENV_ID) {
        initOpts.env = CLOUD_ENV_ID;
      }
      wx.cloud.init(initOpts);
    }

    // 解析启动参数（生产环境不输出日志）
    this.parseLaunchOptions(options);
  },

  onShow: function (options) {
    // 每次显示时也解析参数 (处理从后台回到前台的情况)
    this.parseLaunchOptions(options);
    // 从后台回到小程序、或在云端改 staff 后，需重新拉角色（避免一直用缓存的「普通用户」）
    if (wx.cloud && wx.cloud.callFunction) {
      this.fetchUserRole(true);
    }
  },

  /**
   * 解析启动参数
   */
  parseLaunchOptions(options) {
    options = options || {};
    const scene = options.scene;
    let query = options.query || {};

    // 解析 scene 字符串（支持 options.scene 和 query.scene 两种来源）
    // wxacode.getUnlimited: scene 字符串在 query.scene 中
    // wxacode.get: scene 字符串在 query.scene 中（URL 编码）
    // 旧版兼容: scene 字符串直接在 options.scene 中
    var sceneStr = '';
    if (query.scene && typeof query.scene === 'string' && query.scene.indexOf('=') >= 0) {
      sceneStr = query.scene;
    } else if (options.scene && typeof options.scene === 'string' && options.scene.indexOf('=') >= 0) {
      sceneStr = options.scene;
    }

    if (!query.store_id && !query.table_id && sceneStr) {
      try {
        var decoded = decodeURIComponent(sceneStr);
        decoded.split('&').forEach(function(pair) {
          var kv = pair.split('=');
          if (kv.length === 2 && kv[0]) {
            var key = kv[0];
            var val = kv[1];
            if (key === 't') key = 'table_id';
            if (key === 's') key = 'store_id';
            query[key] = val;
          }
        });
      } catch(e) {}
    }

    const campaignId = query.campaign_id || query.campaignId || query.scene_param || '';
    if (campaignId) {
      this.globalData.campaignId = campaignId;
    }

    var isScanScene = scene === 1047 || scene === 1011 || scene === 1027 || scene === 1012 || scene === 1013 || scene === 1020 || scene === 1036 || scene === 1038 || scene === 1048 || scene === 1049;
    if (query && (query.table_id || query.store_id || query.store_display_name)) {
      this.globalData.scanParams = Object.assign(
        {
          table_id: query.table_id || '',
          store_id: query.store_id || '',
          scene: scene || '',
          timestamp: Date.now()
        },
        query
      );
    } else if (isScanScene && query && Object.keys(query).length > 0) {
      this.globalData.scanParams = Object.assign(
        {
          table_id: query.table_id || '',
          store_id: query.store_id || '',
          scene: scene,
          timestamp: Date.now()
        },
        query
      );
    }

    if (!scene && Object.keys(query).length > 0) {
      this.globalData.scanParams = Object.assign({ timestamp: Date.now() }, query);
    }
  },

  getOrderMiniProgramConfig: function(storeId) {
    var sid = storeId != null ? String(storeId).trim() : '';
    return ORDER_MINI_PROGRAM_CONFIGS[sid] || ORDER_MINI_PROGRAM_CONFIGS[DEFAULT_STORE_ID];
  },

  getOrderLaunchParams: function(scanParams) {
    return getOrderLaunchParams(scanParams);
  },

  globalData: {
    userInfo: null,
    isStaff: false,
    staffInfo: null,
    /** staff | manager | admin | null，与云库 staff 表一致 */
    userRole: null,
    userRoleLoaded: false,
    staffStoreId: '',
    // 扫码进入参数
    scanParams: null,
    // 非扫码入口的活动ID（分享链接、公众号菜单等）
    campaignId: '',
    // 点餐小程序（按门店分流，默认沿用马己仙配置）
    orderMiniProgramConfigs: ORDER_MINI_PROGRAM_CONFIGS,
    orderTableTokenMappings: ORDER_TABLE_TOKEN_MAPPINGS
  },

  /**
   * 从云端刷新角色缓存
   * @param {boolean} force 为 true 时忽略「已加载」缓存，重新请求（改库后必用）
   */
  fetchUserRole: function (force) {
    var self = this;
    if (force) {
      self.globalData.userRoleLoaded = false;
    }
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.globalData.userRoleLoaded = true;
      self.globalData.userRole = null;
      self.globalData.isStaff = false;
      self.globalData.staffStoreId = '';
      self.globalData.staffInfo = null;
      return Promise.resolve(null);
    }
    return wx.cloud
      .callFunction({ name: 'getStaffProfile', data: {} })
      .then(function (res) {
        var payload = (res && res.result) || {};
        if (payload.success && payload.is_staff) {
          self.globalData.userRole = payload.role || 'staff';
          self.globalData.isStaff = true;
          self.globalData.staffStoreId = payload.store_id || '';
          self.globalData.staffInfo = payload.data || {
            role: payload.role,
            store_id: payload.store_id
          };
        } else {
          self.globalData.userRole = null;
          self.globalData.isStaff = false;
          self.globalData.staffStoreId = '';
          self.globalData.staffInfo = null;
        }
        self.globalData.userRoleLoaded = true;
        return self.globalData.userRole;
      })
      .catch(function (err) {
        console.error('fetchUserRole:', err);
        self.globalData.userRoleLoaded = true;
        return self.globalData.userRole;
      });
  },

  /**
   * 检查用户是否为员工（兼容旧调用）
   */
  checkStaffStatus: function () {
    var self = this;
    return this.fetchUserRole().then(function (role) {
      return !!role;
    });
  }
});
