var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();

exports.main = async function (event, context) {
  var stores = event.stores || [
    {
      store_id: '64822111',
      store_display_name: '马己仙广东小馆音乐广场店',
      store_name: '马己仙',
      template_received: 'pyk3FCeBC4MtxptY3ZBeLUOiVx93Lmb_4pxkN8AFowE',
      template_expiring: 'y2OgEdK4ADr5ibGuJFJEsy2CNU7ELq9d-If6jUv8ee4'
    },
    {
      store_id: '64822112',
      store_display_name: '洪潮传统潮汕菜大宁久光店',
      store_name: '洪潮',
      template_received: 'pyk3FCeBC4MtxptY3ZBeLUOiVx93Lmb_4pxkN8AFowE',
      template_expiring: 'y2OgEdK4ADr5ibGuJFJEsy2CNU7ELq9d-If6jUv8ee4'
    }
  ];

  var results = [];
  for (var i = 0; i < stores.length; i++) {
    var s = stores[i];
    try {
      // 直接插入，如果已存在则更新
      var existRes = await db.collection('store_subscribe_configs')
        .where({ store_id: s.store_id }).limit(1).get();

      if (existRes.data.length > 0) {
        await db.collection('store_subscribe_configs')
          .doc(existRes.data[0]._id)
          .update({ data: s });
        results.push({ store_id: s.store_id, action: 'updated' });
      } else {
        await db.collection('store_subscribe_configs').add({ data: s });
        results.push({ store_id: s.store_id, action: 'created' });
      }
    } catch (e) {
      // 集合不存在时直接插入创建
      if (e.message && e.message.indexOf('not exist') >= 0) {
        try {
          await db.collection('store_subscribe_configs').add({ data: s });
          results.push({ store_id: s.store_id, action: 'created' });
        } catch (e2) {
          results.push({ store_id: s.store_id, action: 'error', error: e2.message });
        }
      } else {
        results.push({ store_id: s.store_id, action: 'error', error: e.message });
      }
    }
  }

  return { success: true, results: results };
};
