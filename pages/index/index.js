// pages/index/index.js
var ENABLE_ONLOAD_DEBUG_MODAL = false;

// 开发模式：无扫码参数时模拟扫码（仅开发调试用，上线前改为 false）
var DEV_SIMULATE_SCAN = false;

var roleUtil = require('../../utils/role.js');

var STORE_CONFIGS = {
  '51866138': {
    name: '马己仙广东小馆',
    welcomeTitle: '马己仙广东小馆欢迎您',
    ctaText: '扫码点餐',
    trustText: '授权手机号仅用于会员识别'
  },
  '64822111': {
    name: '洪潮潮汕传统菜',
    welcomeTitle: '洪潮潮汕传统菜欢迎您',
    ctaText: '扫码点餐',
    trustText: '授权手机号仅用于会员识别'
  }
};

function getStoreConfig(scanParams) {
  var sid = (scanParams && scanParams.store_id) || '';
  return STORE_CONFIGS[sid] || STORE_CONFIGS['51866138'];
}

function buildEntrySections(role) {
  var sections = [];
  if (role === 'staff' || role === 'manager' || role === 'admin') {
    sections.push({
      title: '门店操作',
      items: [
        {
          key: 'verify',
          title: '员工核销',
          sub: '扫码核销优惠券',
          url: '/pages/staff/verify',
          icon: '核'
        }
      ]
    });
  }
  if (role === 'manager') {
    sections.push({
      title: '店长',
      items: [
        {
          key: 'storedash',
          title: '门店数据',
          sub: '今日发券与收入',
          url: '/pages/admin/dashboard',
          icon: '店'
        }
      ]
    });
  }
  if (role === 'admin') {
    sections.push({
      title: '总部',
      items: [
        {
          key: 'vouchers',
          title: '券模板管理',
          sub: '创建/编辑代金券',
          url: '/pages/admin/vouchers',
          icon: '券'
        },
        {
          key: 'marketing',
          title: '营销管理',
          sub: '规则开关与优先级',
          url: '/pages/admin/marketing',
          icon: '营'
        },
        {
          key: 'customers',
          title: '客户管理',
          sub: '用户数据与分析',
          url: '/pages/admin/customers',
          icon: '客'
        },
        {
          key: 'storedash',
          title: '门店数据看板',
          sub: '今日发券与收入',
          url: '/pages/admin/dashboard?scope=store',
          icon: '店'
        },
        {
          key: 'dash',
          title: '数据看板',
          sub: '全盘经营指标',
          url: '/pages/admin/dashboard',
          icon: '数'
        },
        {
          key: 'activitycode',
          title: '活动码生成',
          sub: '生成企微活动二维码',
          url: '/pages/admin/activityCode/index',
          icon: '活'
        }
      ]
    });
  }
  if (!role) {
    sections.push({
      title: '会员',
      items: [
        {
          key: 'shop',
          title: '门店专属优惠',
          sub: '浏览可购买礼遇券',
          url: '/pages/shop/index',
          icon: '惠'
        },
        {
          key: 'vouchers',
          title: '我的优惠券',
          sub: '查看已获得优惠券',
          url: '/pages/voucher/list',
          icon: '券'
        }
      ]
    });
  }
  return sections;
}

/** 拼接跳转点餐小程序的 path，透传扫码 query，避免缺参导致对方白屏 */
function buildOrderMiniPath(basePath, scanParams, extraStaticQuery) {
  var skip = { timestamp: 1, scene: 1 };
  var merged = {};
  Object.keys(scanParams || {}).forEach(function(k) {
    if (skip[k]) return;
    var v = scanParams[k];
    if (v === undefined || v === null || v === '') return;
    if (typeof v === 'object') return;
    merged[k] = v;
  });
  extraStaticQuery = extraStaticQuery || {};
  Object.keys(extraStaticQuery).forEach(function(k) {
    var v = extraStaticQuery[k];
    if (v !== undefined && v !== null && v !== '') merged[k] = v;
  });
  var parts = [];
  Object.keys(merged).forEach(function(k) {
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(merged[k])));
  });
  var qs = parts.join('&');
  if (!qs) return basePath;
  var sep = basePath.indexOf('?') >= 0 ? '&' : '?';
  return basePath + sep + qs;
}

Page({
  data: {
    isFromScan: false,
    scanParams: null,
    showAuthModal: false,
    showLegacyMemberTip: false,
    legacyMemberPoints: 0,
    hasAuthorizedMember: false,
    inputPhone: '',
    pageReady: false,
    entrySections: [],
    roleLoaded: false,
    storeConfig: STORE_CONFIGS['51866138'],
    availableVoucherCount: 0,
    checkingMember: true
  },

  refreshRoleEntries: function () {
    var self = this;
    var app = getApp();
    if (!app || typeof app.fetchUserRole !== 'function') {
      self.setData({ entrySections: buildEntrySections(null), roleLoaded: true });
      return;
    }
    app.fetchUserRole(true).then(function () {
      var role = app.globalData.userRole;
      self.setData({
        entrySections: buildEntrySections(role),
        roleLoaded: true
      });
    });
  },

  checkExistingMember: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ checkingMember: false, showAuthModal: true });
      return;
    }
    wx.cloud.callFunction({
      name: 'ensureUserDoc',
      data: { scanParams: self.data.scanParams || {} },
      success: function (res) {
        var r = (res && res.result) || {};
        if (r.success && r.phone) {
          self.setData({ hasAuthorizedMember: true, checkingMember: false });
          self.loadAvailableVouchers();
          if (!self.data.roleLoaded) {
            self.refreshRoleEntries();
          }
        } else {
          self.setData({ checkingMember: false, showAuthModal: true });
        }
      },
      fail: function () {
        self.setData({ checkingMember: false, showAuthModal: true });
      }
    });
  },

  /** 云函数：仅保证 users 集合有当前 openid 对应记录（不写 Users、不要手机号） */
  /**
   * 扫码进店：先 ensure users，再写 user_arrival_logs（需传 store_id）
   */
  invokeDetectUserArrival: function() {
    if (!wx.cloud || !wx.cloud.callFunction) return;
    var app = getApp();
    var scanParams = (app.globalData && app.globalData.scanParams) || {};
    var storeId = scanParams.store_id;
    if (!storeId) return;
    var sid = String(storeId).trim();
    if (!sid) return;
    wx.cloud
      .callFunction({
        name: 'ensureUserDoc',
        data: { scanParams: scanParams }
      })
      .then(function() {
        return wx.cloud.callFunction({
          name: 'detectUserArrival',
          data: { store_id: sid }
        });
      })
      .then(function(res) {
        if (res && res.result && res.result.success) {
          // detectUserArrival ok
        } else if (res && res.result) {
          // detectUserArrival skip
        }
      })
      .catch(function(e) {
        var msg = (e && e.errMsg) || '';
        if (msg.indexOf('-501000') >= 0 || msg.indexOf('could not be found') >= 0) {
          return;
        }
        console.warn('detectUserArrival 调用失败:', e);
      });
  },

  ensureUserDocInCloud: function() {
    if (!wx.cloud || !wx.cloud.callFunction) return;
    var app = getApp();
    var scanParams = (app.globalData && app.globalData.scanParams) || {};
    wx.cloud
      .callFunction({
        name: 'ensureUserDoc',
        data: { scanParams: scanParams }
      })
      .then(function(res) {
        // ensureUserDoc 结果
      })
      .catch(function(e) {
        var msg = (e && e.errMsg) || '';
        if (msg.indexOf('-501000') >= 0 || msg.indexOf('could not be found') >= 0) {
          // ensureUserDoc 尚未上传，已跳过（开发阶段正常）
          return;
        }
        console.warn('ensureUserDoc 调用失败:', e);
      });
  },

  syncScanFromApp: function() {
    try {
      var app = getApp();
      var scanParams = app.globalData && app.globalData.scanParams;
      if (scanParams) {
        this.setData({
          isFromScan: true,
          scanParams: scanParams,
          storeConfig: getStoreConfig(scanParams),
          pageReady: true
        });
      } else if (DEV_SIMULATE_SCAN) {
        this.setData({
          isFromScan: true,
          scanParams: {
            table_id: 'T01',
            store_id: '51866138',
            store_display_name: '马己仙广东小馆(测试)',
            scene: 1047,
            timestamp: Date.now()
          },
          storeConfig: STORE_CONFIGS['51866138'],
          pageReady: true
        });
      } else {
        this.setData({ pageReady: true, storeConfig: getStoreConfig(null) });
      }
      if (!this.data.hasAuthorizedMember && !this.data.showLegacyMemberTip) {
        this.checkExistingMember();
      }
    } catch (e) {
      console.error('syncScanFromApp error:', e);
      this.setData({ pageReady: true });
      this.ensureUserDocInCloud();
    }
  },

  onLoad: function(options) {
    try {
      this.setData({ pageReady: true });
      this.syncScanFromApp();
      this.refreshRoleEntries();
      this.invokeDetectUserArrival();
    } catch (e) {
      console.error('onLoad error:', e);
      this.setData({ pageReady: true });
      this.ensureUserDocInCloud();
      this.refreshRoleEntries();
      this.invokeDetectUserArrival();
    }
  },

  onShow: function() {
    this.refreshRoleEntries();
  },

  /** 点击遮罩关闭弹窗，便于阅读落地说明后通过下方「授权入会」再次发起 */
  onModalBackdropTap: function() {
    if (this.data.showAuthModal) {
      this.setData({ showAuthModal: false });
    }
  },

  onGetPhoneNumber: function(e) {
    // console.log('授权回调:', e);
    if (!e.detail || !e.detail.errMsg) {
      wx.showToast({ title: '授权失败，请重试', icon: 'none' });
      return;
    }

    var errMsg = String(e.detail.errMsg);
    var lower = errMsg.toLowerCase();
    var code = e.detail.code;

    // 须先于「用户拒绝」判断：fail no permission 也以 getPhoneNumber:fail 开头
    if (lower.indexOf('no permission') >= 0) {
      wx.showModal({
        title: '暂无法使用手机号登录',
        content:
          '当前小程序暂不具备手机号快速验证能力（例如未完成微信认证等）。请联系门店或稍后再试。',
        showCancel: false
      });
      return;
    }

    // 用户拒绝或取消：无 code，用面向顾客的文案，不误导为后台未配置
    if (
      lower.indexOf('user deny') >= 0 ||
      lower.indexOf('user cancel') >= 0 ||
      errMsg.indexOf('拒绝') >= 0 ||
      (lower.indexOf('deny') >= 0 && lower.indexOf('getphonenumber') >= 0) ||
      (lower.indexOf('cancel') >= 0 && lower.indexOf('getphonenumber') >= 0)
    ) {
      wx.showModal({
        title: '未授权手机号',
        content:
          '您未同意授权手机号，将无法完成入会并跳转点餐。如需继续，请点下方「授权入会」或再次打开本页按提示授权。',
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }

    if (!code) {
      wx.showModal({
        title: '暂时无法获取手机号',
        content:
          '未拿到授权凭证。若您已在弹窗中点击了同意，请关闭本页后重试一次；若多次失败，请联系店员或稍后再试。（商户侧需在微信公众平台配置隐私指引与手机号相关能力。）',
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }

    if (errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '授权未完成，请重试', icon: 'none' });
      return;
    }

    if (!wx.cloud || !wx.cloud.callFunction) {
      wx.showModal({
        title: '云能力未初始化',
        content: '请确认已选择云开发环境并重新预览。',
        showCancel: false
      });
      return;
    }

    wx.showLoading({ title: '正在入会...' });
    var self = this;

    wx.cloud.callFunction({
      name: 'saveUserPhone',
      data: {
        code: e.detail.code,
        scanParams: self.data.scanParams
      },
      success: function(result) {
        wx.hideLoading();
        // console.log('云函数完整返回:', result);

        var payload = result && result.result;
        if (!payload || payload.success === false) {
          var errText =
            (payload && payload.errMsg) ||
            (payload && payload.message) ||
            (result && result.errMsg) ||
            '云函数返回异常，请打开云开发控制台查看 saveUserPhone 日志';
          wx.showModal({
            title: '入会未成功',
            content: errText,
            showCancel: false
          });
          return;
        }

        self.setData({ showAuthModal: false, hasAuthorizedMember: true });

        self.silentAssociateWecom();
        self.loadAvailableVouchers();
      },
      fail: function(err) {
        wx.hideLoading();
        console.error('云函数调用失败:', err);
        var msg = (err && err.errMsg) ? err.errMsg : JSON.stringify(err || {});
        wx.showModal({
          title: '云函数调用失败',
          content:
            msg +
            '\n\n请逐项检查：\n1) 云函数 saveUserPhone 已「上传并部署」\n2) app.js 里 wx.cloud.init 的 env 与开发者工具当前云环境一致\n3) 云数据库已创建 Users 集合且权限允许云函数写入',
          showCancel: false
        });
      }
    });
  },

  silentAssociateWecom: function() {
    var storeId = (this.data.scanParams || {}).store_id || (getApp().globalData.staffStoreId || '') || '51866138';
    wx.cloud.callFunction({
      name: 'associateWecom',
      data: { store_id: storeId }
    });
  },

  loadAvailableVouchers: function() {
    var self = this;
    var storeId = (self.data.scanParams || {}).store_id || (getApp().globalData.staffStoreId || '') || '51866138';
    wx.cloud.callFunction({
      name: 'getUserVouchers',
      data: { store_id: storeId },
      success: function(res) {
        var result = (res && res.result) || {};
        var vouchers = (result.success && result.data) ? result.data : [];
        var available = vouchers.filter(function(v) { return v.status === 'active' || v.status === 'unused'; });
        self.setData({ availableVoucherCount: available.length, showVoucherTip: available.length > 0 });
        if (available.length > 0) {
          setTimeout(function() {
            self.setData({ showVoucherTip: false });
          }, 3000);
        }
      },
      fail: function() {}
    });
  },

  navigateToKeruYun: function() {
    var app = getApp();
    var params = this.data.scanParams || {};
    var storeId = params.store_id || app.globalData.staffStoreId || '51866138';
    var config = (typeof app.getOrderMiniProgramConfig === 'function')
      ? app.getOrderMiniProgramConfig(storeId)
      : ((app.globalData.orderMiniProgramConfigs || {})[storeId] || {});

    if (!config.appId) {
      wx.showModal({
        title: '未配置点餐小程序',
        content: '请在 app.js 的门店点餐配置中填写正确的点餐端小程序 AppID（如马己仙/二代码点餐提供方）。',
        showCancel: false
      });
      return;
    }

    // 模拟器会提示「跳转成功」但无法真正打开其他小程序，易误以为入会失败
    try {
      var sys = wx.getSystemInfoSync();
      if (sys && sys.platform === 'devtools') {
        wx.showModal({
          title: '模拟器无法打开点餐小程序',
          content:
            '开发者工具不支持真实跳转到其他小程序。若上一步已保存手机号，入会数据已成功写入云库。\n\n请使用「预览」在真机上扫码，完成跳转点餐。',
          showCancel: false
        });
        return;
      }
    } catch (e) {
      // ignore
    }

    var basePath =
      config.path ||
      'pages/home/index?origin=minpath&path=pages%2Forderfood%2Findex';
    var path = buildOrderMiniPath(basePath, params, config.extraStaticQuery);

    var envVersion = config.envVersion || 'release';

    // console.log('准备跳转点餐小程序', { appId: config.appId, path: path, envVersion: envVersion });

    var navOpts = {
      appId: config.appId,
      path: path,
      envVersion: envVersion,
      success: function() {
        // console.log('navigateToMiniProgram 已触发');
      },
      fail: function(err) {
        var errMsg = (err && err.errMsg) ? String(err.errMsg).toLowerCase() : '';
        if (errMsg.indexOf('cancel') >= 0) {
          return;
        }
        console.error('跳转点餐小程序失败:', err);
        wx.showModal({
          title: '跳转点餐小程序失败',
          content:
            (err.errMsg || JSON.stringify(err)) +
            '\n\n请到微信公众平台 → 小程序后台：\n• 设置里配置「跳转其他小程序」白名单，加入对方 AppID\n• 若对方仅有体验版，可把 app.js 里 keruYunConfig.envVersion 改为 trial',
          showCancel: false
        });
      }
    };
    if (config.extraData && typeof config.extraData === 'object') {
      navOpts.extraData = config.extraData;
    }
    wx.navigateToMiniProgram(navOpts);
  }
});
