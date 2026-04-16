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

  // 点餐小程序配置（马己仙/客如云等）
  keruYunConfig: {
    appId: 'wxdaa8741d326cf971',  // 点餐小程序 AppID
    path: 'pages/home/index?origin=minpath&path=pages%2Forderfood%2Findex',
    envVersion: 'release',  // release | trial | develop
    extraStaticQuery: {},
    extraData: undefined
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
