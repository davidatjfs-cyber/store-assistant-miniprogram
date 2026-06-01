/**
 * 洪潮门店 · 券模板 + 营销规则种子数据（幂等 upsert）
 * 调用：wx.cloud.callFunction({
 *   name: 'seedHongchaoMarketing',
 *   data: { confirm: 'CONFIRM_SEED_HONGCHAO' }
 * })
 */
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const STORE_ID = '64822111';
const STORE_DISPLAY_NAME = '洪潮门店';
const BRAND = '洪潮';

const TEMPLATE_IDS = {
  new_user: 'hc_tpl_new_001',
  return_user: 'hc_tpl_return_001',
  recall: 'hc_tpl_recall_001',
  vip: 'hc_tpl_vip_001'
};

const RULE_IDS = {
  new_convert: 'hc_rule_new_convert',
  repurchase: 'hc_rule_repurchase',
  recall7d: 'hc_rule_recall_7d',
  vip_boost: 'hc_rule_vip_boost'
};

async function docExists(ref) {
  try {
    const snap = await ref.get();
    return !!(snap && snap.data);
  } catch (e) {
    return false;
  }
}

async function upsertVoucherTemplate(id, fields) {
  const ref = db.collection('voucher_templates').doc(id);
  const base = Object.assign({}, fields, {
    updated_at: db.serverDate()
  });
  const exists = await docExists(ref);
  if (!exists) {
    base.created_at = db.serverDate();
    await ref.set({ data: base });
    return { _id: id, op: 'created' };
  }
  await ref.update({ data: base });
  return { _id: id, op: 'updated' };
}

async function upsertMarketingRule(id, fields) {
  const ref = db.collection('marketing_rules').doc(id);
  const base = Object.assign({}, fields, {
    updated_at: db.serverDate()
  });
  const exists = await docExists(ref);
  if (!exists) {
    base.created_at = db.serverDate();
    await ref.set({ data: base });
    return { _id: id, op: 'created' };
  }
  await ref.update({ data: base });
  return { _id: id, op: 'updated' };
}

async function upsertStore(storeId, fields) {
  const ref = db.collection('stores').doc(storeId);
  const base = Object.assign({}, fields, {
    updated_at: db.serverDate()
  });
  const exists = await docExists(ref);
  if (!exists) {
    base.created_at = db.serverDate();
    await ref.set({ data: base });
    return { _id: storeId, op: 'created' };
  }
  await ref.update({ data: base });
  return { _id: storeId, op: 'updated' };
}

exports.main = async function (event, context) {
  if (!event || event.confirm !== 'CONFIRM_SEED_HONGCHAO') {
    return {
      success: false,
      message: '缺少 confirm: CONFIRM_SEED_HONGCHAO，已拒绝执行'
    };
  }

  try {
    const storeResult = await upsertStore(STORE_ID, {
      store_id: STORE_ID,
      display_name: STORE_DISPLAY_NAME,
      brand: BRAND,
      is_active: true,
      city: '上海',
      address: '上海市'
    });

    const tplResults = [];

    tplResults.push(
      await upsertVoucherTemplate(TEMPLATE_IDS.new_user, {
        name: '新人专享券',
        dish_name: '招牌推荐',
        type: 'cash',
        value: 2000,
        cost_fen: 2000,
        min_spend: 8000,
        valid_days: 3,
        store_ids: [STORE_ID],
        is_active: true,
        price: 2000,
        stock: -1,
        sold_count: 0,
        usage_rule: BRAND + ' · 新人专享 · 限门店 ' + STORE_ID + ' · 满80元可用',
        brand_name: BRAND,
        store_id_default: STORE_ID,
        store_display_name: STORE_DISPLAY_NAME,
        storeName: STORE_DISPLAY_NAME
      })
    );

    tplResults.push(
      await upsertVoucherTemplate(TEMPLATE_IDS.return_user, {
        name: '回头客福利券',
        dish_name: '热销菜品',
        type: 'cash',
        value: 1500,
        cost_fen: 1500,
        min_spend: 6000,
        valid_days: 5,
        store_ids: [STORE_ID],
        is_active: true,
        price: 1500,
        stock: -1,
        sold_count: 0,
        usage_rule: BRAND + ' · 回头客福利 · 限门店 ' + STORE_ID + ' · 满60元可用',
        brand_name: BRAND,
        store_id_default: STORE_ID,
        store_display_name: STORE_DISPLAY_NAME,
        storeName: STORE_DISPLAY_NAME
      })
    );

    tplResults.push(
      await upsertVoucherTemplate(TEMPLATE_IDS.recall, {
        name: '想你了专属券',
        dish_name: '经典菜品',
        type: 'cash',
        value: 2500,
        cost_fen: 2500,
        min_spend: 8000,
        valid_days: 2,
        store_ids: [STORE_ID],
        is_active: true,
        price: 2500,
        stock: -1,
        sold_count: 0,
        usage_rule: BRAND + ' · 召回专享 · 限门店 ' + STORE_ID + ' · 满80元可用 · 短期有效',
        brand_name: BRAND,
        store_id_default: STORE_ID,
        store_display_name: STORE_DISPLAY_NAME,
        storeName: STORE_DISPLAY_NAME
      })
    );

    tplResults.push(
      await upsertVoucherTemplate(TEMPLATE_IDS.vip, {
        name: 'VIP专享券',
        dish_name: '招牌菜',
        type: 'cash',
        value: 3000,
        cost_fen: 3000,
        min_spend: 12000,
        valid_days: 7,
        store_ids: [STORE_ID],
        is_active: true,
        price: 3000,
        stock: -1,
        sold_count: 0,
        usage_rule: BRAND + ' · VIP专享 · 限门店 ' + STORE_ID + ' · 满120元可用',
        brand_name: BRAND,
        store_id_default: STORE_ID,
        store_display_name: STORE_DISPLAY_NAME,
        storeName: STORE_DISPLAY_NAME
      })
    );

    const ruleResults = [];

    ruleResults.push(
      await upsertMarketingRule(RULE_IDS.new_convert, {
        name: '新客转化-首单发券',
        trigger_type: 'payment',
        trigger_value: 0,
        target_tags: ['new'],
        action_type: 'send_voucher',
        action_config: { template_id: TEMPLATE_IDS.new_user },
        priority: 100,
        dynamic_priority: 100,
        cooldown_days: 7,
        daily_user_limit: 1,
        auto_disable_roi_threshold: 0.8,
        active: true,
        brand_name: BRAND,
        store_id: STORE_ID,
        storeName: STORE_DISPLAY_NAME,
        store_display_name: STORE_DISPLAY_NAME
      })
    );

    ruleResults.push(
      await upsertMarketingRule(RULE_IDS.repurchase, {
        name: '复购驱动-普通用户',
        trigger_type: 'payment',
        trigger_value: 3000,
        target_tags: ['active'],
        action_type: 'send_voucher',
        action_config: { template_id: TEMPLATE_IDS.return_user },
        priority: 80,
        dynamic_priority: 80,
        cooldown_days: 3,
        daily_user_limit: 1,
        auto_disable_roi_threshold: 0.9,
        active: true,
        brand_name: BRAND,
        store_id: STORE_ID,
        storeName: STORE_DISPLAY_NAME,
        store_display_name: STORE_DISPLAY_NAME
      })
    );

    ruleResults.push(
      await upsertMarketingRule(RULE_IDS.recall7d, {
        name: '7天召回',
        trigger_type: 'inactivity',
        trigger_value: 7,
        target_tags: ['dormant'],
        action_type: 'send_voucher',
        action_config: { template_id: TEMPLATE_IDS.recall },
        priority: 90,
        dynamic_priority: 90,
        cooldown_days: 7,
        daily_user_limit: 1,
        auto_disable_roi_threshold: 0.7,
        active: true,
        brand_name: BRAND,
        store_id: STORE_ID,
        storeName: STORE_DISPLAY_NAME,
        store_display_name: STORE_DISPLAY_NAME
      })
    );

    ruleResults.push(
      await upsertMarketingRule(RULE_IDS.vip_boost, {
        name: 'VIP高价值用户激励',
        trigger_type: 'payment',
        trigger_value: 0,
        target_tags: ['vip'],
        action_type: 'send_voucher',
        action_config: { template_id: TEMPLATE_IDS.vip },
        priority: 110,
        dynamic_priority: 110,
        cooldown_days: 5,
        daily_user_limit: 1,
        auto_disable_roi_threshold: 1.0,
        active: true,
        brand_name: BRAND,
        store_id: STORE_ID,
        storeName: STORE_DISPLAY_NAME,
        store_display_name: STORE_DISPLAY_NAME
      })
    );

    return {
      success: true,
      brand_name: BRAND,
      store_id: STORE_ID,
      store_display_name: STORE_DISPLAY_NAME,
      store: storeResult,
      voucher_templates: {
        keys: TEMPLATE_IDS,
        results: tplResults
      },
      marketing_rules: {
        keys: RULE_IDS,
        results: ruleResults
      },
      note:
        '洪潮门店种子数据。券模板使用 is_active（非 status）。调用 seedHongchaoMarketing 之后再部署 uploadVoucherTemplate / uploadMarketingRule（如有）。'
    };
  } catch (err) {
    console.error('seedHongchaoMarketing', err);
    return {
      success: false,
      message: err.message || String(err)
    };
  }
};
