// 云函数：生成活动小程序码（用于企微群发）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

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
        checkPath: false // 不检查页面是否存在（开发版必须）
      })
      return {
        success: true,
        base64: result.buffer.toString('base64')
      }
    } catch (unlimitedErr) {
      // 如果 getUnlimited 失败（通常因为未发布），降级使用 get 接口
      console.log('getUnlimited 失败，尝试 get 接口:', unlimitedErr.message)
      
      const result = await cloud.openapi.wxacode.get({
        path: 'pages/index/index?scene=' + scene,
        width: 430,
        autoColor: true,
        isHyaline: false
      })
      
      return {
        success: true,
        base64: result.buffer.toString('base64')
      }
    }
  } catch (err) {
    // 最终错误处理
    if (err.errCode === 40129 || err.errCode === 40001) {
      return { 
        success: false, 
        msg: '小程序未发布或路径错误。请先发布小程序体验版后再试。' 
      }
    }
    return { success: false, msg: '生成失败: ' + (err.message || err.errMsg) }
  }
}