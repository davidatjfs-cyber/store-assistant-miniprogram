// app.js
//
// 云环境 ID 必须属于「当前小程序」在云开发里开通的环境。
// 若写错或沿用其他项目的 env，会报错：errCode -501000 | env status is isolated
//
// 获取方式：登录 mp.weixin.qq.com → 开发 → 云开发 → 右上角「设置」或环境列表里复制「环境 ID」
var CLOUD_ENV_ID = 'cloud1-2gqo1169d58023d7'; // 例如 'cloud1-AbcDef'；留空则使用本小程序默认云环境（仅当已在云开发里创建过环境）

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

    // 微信小程序码场景：参数编码在 options.scene 字符串中，不在 query 里
    if (!query.store_id && !query.table_id && options.scene && typeof options.scene === 'string' && options.scene.indexOf('=') >= 0) {
      try {
        var decoded = decodeURIComponent(options.scene);
        decoded.split('&').forEach(function(pair) {
          var kv = pair.split('=');
          if (kv.length === 2 && kv[0]) {
            query[kv[0]] = kv[1];
          }
        });
      } catch(e) {
        // decode failed, keep original query
      }
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
    // 点餐小程序（马己仙/二代码点餐等；名称以对方后台为准）
    keruYunConfig: {
      appId: 'wxdaa8741d326cf971', // 须与马己仙小程序 AppID 一致，并在公众平台配置跳转白名单
      // 马己仙：壳页 + 内嵌真实路由（path 为 encode 后的子路径）
      // 首页示例：pages/home/index?origin=minpath&path=pages%2Flightshop%2Findex
      // 会员中心：pages/home/index?origin=minpath&path=pages%2Fmember%2Fmember-index%2Findex
      path: 'pages/home/index?origin=minpath&path=pages%2Forderfood%2Findex',
      // release | trial | develop — 对方仅有体验版时请改为 trial
      envVersion: 'release',
      // 若对方要求固定 query（如 tenantId），在此补充，会覆盖同名扫码参数
      extraStaticQuery: {},
      // 少数方案用 extraData 接参，对方 onLaunch 里从 referrerInfo.extraData 读取
      extraData: undefined
    }
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
