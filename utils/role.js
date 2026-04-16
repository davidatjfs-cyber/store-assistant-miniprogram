/**
 * 角色：以后端 staff 表为准，与 app.globalData 缓存同步。
 */

var ALLOWED_ROLES = { staff: 1, manager: 1, admin: 1 };

function getAppSafe() {
  try {
    return getApp();
  } catch (e) {
    return null;
  }
}

/**
 * 确保已从云端拉取角色（app 启动时会触发一次；页面可 await 本函数）。
 */
function ensureRoleLoaded() {
  var app = getAppSafe();
  if (!app || typeof app.fetchUserRole !== 'function') {
    return Promise.resolve(null);
  }
  if (app.globalData.userRoleLoaded) {
    return Promise.resolve(app.globalData.userRole);
  }
  return app.fetchUserRole();
}

/**
 * 返回 role：staff | manager | admin | null
 */
function getUserRole() {
  return ensureRoleLoaded().then(function () {
    var app = getAppSafe();
    return app ? app.globalData.userRole : null;
  });
}

/**
 * 同步读取缓存（仅在已加载后可靠）。
 */
function getUserRoleSync() {
  var app = getAppSafe();
  if (!app || !app.globalData.userRoleLoaded) return null;
  return app.globalData.userRole;
}

function isRoleAllowed(role, allowedRoles) {
  if (!allowedRoles || !allowedRoles.length) return false;
  for (var i = 0; i < allowedRoles.length; i++) {
    if (allowedRoles[i] === role) return true;
  }
  return false;
}

/**
 * @param {string[]} allowedRoles
 * @returns {Promise<boolean>} 有权限 true，否则 false（已提示并回首页）
 */
function checkRoleAccess(allowedRoles) {
  var app = getAppSafe();
  if (!app || typeof app.fetchUserRole !== 'function') {
    return Promise.resolve(false);
  }
  return app.fetchUserRole(true).then(function () {
    var role = app.globalData.userRole;
    if (isRoleAllowed(role, allowedRoles)) {
      return true;
    }
    wx.showModal({
      title: '无权限访问',
      content: '当前账号无权使用此功能。',
      showCancel: false,
      success: function () {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
    return false;
  });
}

module.exports = {
  ALLOWED_ROLES: ALLOWED_ROLES,
  ensureRoleLoaded: ensureRoleLoaded,
  getUserRole: getUserRole,
  getUserRoleSync: getUserRoleSync,
  checkRoleAccess: checkRoleAccess,
  isRoleAllowed: isRoleAllowed
};
