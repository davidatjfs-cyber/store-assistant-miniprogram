const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async function (event) {
  if (event.confirm !== 'CONFIRM_SEED_MARKETING_RULES') {
    return { success: false, message: '请传入 confirm: "CONFIRM_SEED_MARKETING_RULES" 以确认执行' };
  }

  var rules = [
    {
      name: '老板红包5元',
      store_id: '51866138',
      active: true,
      priority: 10,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    },
    {
      name: '老板红包5元',
      store_id: '64822111',
      active: true,
      priority: 10,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  ];

  var results = [];
  for (var i = 0; i < rules.length; i++) {
    try {
      var added = await db.collection('marketing_rules').add({ data: rules[i] });
      results.push({ id: added._id, name: rules[i].name, store_id: rules[i].store_id, status: 'created' });
    } catch (e) {
      results.push({ name: rules[i].name, store_id: rules[i].store_id, status: 'error', reason: e.message });
    }
  }

  return { success: true, created: results.length, details: results };
};