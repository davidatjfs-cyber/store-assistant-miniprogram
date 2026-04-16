const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { id } = event
    if (!id) return { success: false, message: '缺少模板ID' }
    await db.collection('voucher_templates').doc(id).remove()
    return { success: true }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
