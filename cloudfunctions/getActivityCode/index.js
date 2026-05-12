/**
 * 生成活动小程序码（用于企微群发/桌面码）
 * 使用金色 + 透明底替代默认黑白，视觉上融入黑金主题
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

var GOLD = { r: 201, g: 169, b: 110 }

exports.main = async (event, context) => {
  const { scene } = event
  try {
    if (!scene) return { success: false, msg: '缺少 scene 参数' }

    // 优先尝试 getUnlimited（正式版可用）
    try {
      const result = await cloud.openapi.wxacode.getUnlimited({
        scene: scene,
        page: 'pages/index/index',
        width: 430,
        checkPath: false,
        autoColor: false,
        lineColor: GOLD,
        isHyaline: true
      })
      return {
        success: true,
        base64: result.buffer.toString('base64')
      }
    } catch (unlimitedErr) {
      console.log('getUnlimited 失败，尝试 get 接口:', unlimitedErr.message)

      const result = await cloud.openapi.wxacode.get({
        path: 'pages/index/index?scene=' + scene,
        width: 430,
        autoColor: false,
        lineColor: GOLD,
        isHyaline: true
      })

      return {
        success: true,
        base64: result.buffer.toString('base64')
      }
    }
  } catch (err) {
    if (err.errCode === 40129 || err.errCode === 40001) {
      return {
        success: false,
        msg: '小程序未发布或路径错误。请先发布小程序体验版后再试。'
      }
    }
    return { success: false, msg: '生成失败: ' + (err.message || err.errMsg) }
  }
}