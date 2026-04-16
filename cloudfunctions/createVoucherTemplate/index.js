const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const data = event.data || {}
    if (!data.name) return { success: false, message: '缺少券名称' }
    data.created_at = db.serverDate()
    data.updated_at = db.serverDate()
    data.sold_count = 0
    const res = await db.collection('voucher_templates').add({ data })
    return { success: true, id: res._id }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
