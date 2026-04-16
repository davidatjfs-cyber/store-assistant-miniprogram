const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { id, data } = event
    if (!id) return { success: false, message: '缺少模板ID' }
    data.updated_at = db.serverDate()
    await db.collection('voucher_templates').doc(id).update({ data })
    return { success: true }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
