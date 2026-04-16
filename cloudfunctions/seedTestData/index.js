/**
 * 云开发测试数据种子
 * 使用方法：在云开发控制台 → 云函数 → 新建云函数 → 粘贴此代码 → 运行
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { action } = event

  try {
    switch (action) {
      case 'seed_test_data':
        return await seedTestData()
      case 'clear_test_data':
        return await clearTestData()
      case 'get_test_summary':
        return await getTestSummary()
      default:
        return { success: false, error: 'Unknown action' }
    }
  } catch (error) {
    console.error('Error:', error)
    return { success: false, error: error.message }
  }
}

// 创建测试数据
async function seedTestData() {
  const results = {}

  // 1. 创建测试员工
  const staffData = {
    _id: 'staff_test_001',
    openid: 'TEST_DEV_OPENID_REPLACE_ME', // 开发环境占位符，部署前请替换为实际 openid
    name: '测试员工',
    role: 'manager',
    store_id: 'store_test_001',
    active: true,
    created_at: new Date()
  }

  try {
    const existingStaff = await db.collection('staff').doc('staff_test_001').get()
    results.staff = { status: 'exists', message: '测试员工已存在' }
  } catch (e) {
    await db.collection('staff').add({
      data: staffData
    })
    results.staff = { status: 'created', data: staffData }
  }

  // 2. 创建测试券模板
  const voucherTemplateData = {
    _id: 'test_voucher_100',
    name: '100元测试代金券',
    type: 'cash',
    value: 10000,
    usage_rule: '全场通用，不找零',
    valid_days: 30,
    price: 100,
    stock: -1,
    sold_count: 0,
    is_active: true,
    store_ids: ['store_test_001'],
    min_spend: 0,
    valid_time_range: { start: '00:00', end: '23:59' },
    valid_weekdays: [1, 2, 3, 4, 5, 6, 7],
    created_at: new Date()
  }

  try {
    const existingVoucher = await db.collection('voucher_templates').doc('test_voucher_100').get()
    results.voucherTemplate = { status: 'exists', message: '测试券模板已存在' }
  } catch (e) {
    await db.collection('voucher_templates').add({
      data: voucherTemplateData
    })
    results.voucherTemplate = { status: 'created', data: voucherTemplateData }
  }

  // 3. 创建测试营销规则
  const marketingRuleData = {
    _id: 'mkt_test_payment',
    name: '测试支付满赠',
    trigger_type: 'payment',
    trigger_value: 0,
    action_type: 'send_voucher',
    action_config: 'test_voucher_100',
    active: true,
    priority: 10,
    daily_user_limit: 1,
    global_daily_limit: 100,
    target_tags: [],
    cooldown_days: 7,
    created_at: new Date()
  }

  try {
    const existingMarketing = await db.collection('marketing_rules').doc('mkt_test_payment').get()
    results.marketingRule = { status: 'exists', message: '测试营销规则已存在' }
  } catch (e) {
    await db.collection('marketing_rules').add({
      data: marketingRuleData
    })
    results.marketingRule = { status: 'created', data: marketingRuleData }
  }

  // 4. 创建测试用户（使用占位符）
  const userData = {
    _id: 'user_test_001',
    openid: 'TEST_DEV_OPENID_REPLACE_ME', // 开发环境占位符，部署前请替换为实际 openid
    phone: '13800000000',
    created_at: new Date()
  }

  try {
    const existingUser = await db.collection('users').doc('user_test_001').get()
    results.user = { status: 'exists', message: '测试用户已存在' }
  } catch (e) {
    await db.collection('users').add({
      data: userData
    })
    results.user = { status: 'created', data: userData }
  }

  return {
    success: true,
    message: '测试数据创建完成',
    results
  }
}

// 清理测试数据
async function clearTestData() {
  const results = {}

  // 清理测试员工
  try {
    await db.collection('staff').doc('staff_test_001').remove()
    results.staff = { status: 'deleted' }
  } catch (e) {
    results.staff = { status: 'not_found' }
  }

  // 清理测试券模板
  try {
    await db.collection('voucher_templates').doc('test_voucher_100').remove()
    results.voucherTemplate = { status: 'deleted' }
  } catch (e) {
    results.voucherTemplate = { status: 'not_found' }
  }

  // 清理测试营销规则
  try {
    await db.collection('marketing_rules').doc('mkt_test_payment').remove()
    results.marketingRule = { status: 'deleted' }
  } catch (e) {
    results.marketingRule = { status: 'not_found' }
  }

  // 清理测试用户
  try {
    await db.collection('users').doc('user_test_001').remove()
    results.user = { status: 'deleted' }
  } catch (e) {
    results.user = { status: 'not_found' }
  }

  return {
    success: true,
    message: '测试数据清理完成',
    results
  }
}

// 获取测试数据摘要
async function getTestSummary() {
  const summary = {}

  // 统计员工
  try {
    const staffRes = await db.collection('staff').where({ name: '测试员工' }).get()
    summary.staffCount = staffRes.data.length
  } catch (e) {
    summary.staffCount = 0
  }

  // 统计券模板
  try {
    const voucherRes = await db.collection('voucher_templates').where({ name: '100元测试代金券' }).get()
    summary.voucherCount = voucherRes.data.length
  } catch (e) {
    summary.voucherCount = 0
  }

  // 统计营销规则
  try {
    const marketingRes = await db.collection('marketing_rules').where({ name: '测试支付满赠' }).get()
    summary.marketingCount = marketingRes.data.length
  } catch (e) {
    summary.marketingCount = 0
  }

  // 统计用户
  try {
    const userRes = await db.collection('users').where({ phone: '13800138000' }).get()
    summary.userCount = userRes.data.length
  } catch (e) {
    summary.userCount = 0
  }

  return {
    success: true,
    summary
  }
}
