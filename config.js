/**
 * 门店私域助手 - 环境配置
 * 
 * 使用说明：
 * 1. 复制此文件为 config.local.js
 * 2. 修改 config.local.js 中的配置为你的实际值
 * 3. config.local.js 已在 .gitignore 中，不会被提交到 Git
 */

module.exports = {
  // 云开发环境 ID（必填）
  // 获取方式：mp.weixin.qq.com → 开发 → 云开发 → 设置 → 环境 ID
  cloudEnvId: 'cloud1-2gqo1169d58023d7',

  // 点餐小程序配置（按门店分流）
  orderMiniProgramConfigs: {
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
  },

  // 订阅消息模板 ID（支付成功后通知）
  // 获取方式：mp.weixin.qq.com → 订阅消息 → 模板库
  subscribeMsgTemplateId: '',  // 替换为实际的模板 ID

  // 门店默认配置
  defaultStore: {
    id: '',
    displayName: ''
  }
};
