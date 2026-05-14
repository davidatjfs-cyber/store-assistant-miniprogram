const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const { store_id } = event || {}
    const res = await db.collection('voucher_templates')
      .orderBy('created_at', 'desc')
      .get()

    if (!store_id) {
      return { success: true, data: res.data }
    }

    const list = res.data.filter(function (t) {
      var ids = t.store_ids
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.indexOf(store_id) >= 0 || ids.indexOf('*') >= 0
      }
      var def = t.store_id_default
      if (def) {
        return def === store_id || def === '*'
      }
      return true
    })

    return { success: true, data: list }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
