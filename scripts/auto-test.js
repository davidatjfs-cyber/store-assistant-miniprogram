// 自动化测试脚本
// 使用方法：在微信开发者工具控制台粘贴运行，或部署为云函数测试

async function runAutoTests() {
  console.log('🚀 开始自动化测试...\n')
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  }

  function logTest(name, success, msg) {
    results.total++
    if (success) results.passed++
    else results.failed++
    results.details.push({ name, success, msg })
    console.log(success ? `✅ ${name}` : `❌ ${name}: ${msg}`)
  }

  // ========== 测试 1: 基础连接 ==========
  try {
    const res = await wx.cloud.callFunction({ name: 'getStaffProfile', data: {} })
    logTest('基础连接', res.result && res.result.success !== undefined, res.result ? res.result.msg : '调用失败')
  } catch (e) {
    logTest('基础连接', false, e.message)
  }

  // ========== 测试 2: 获取券模板列表 ==========
  let templates = []
  try {
    const res = await wx.cloud.callFunction({ name: 'getVoucherTemplates', data: {} })
    templates = (res.result && res.result.success && res.result.data) || []
    logTest('获取券模板列表', templates.length > 0, `找到 ${templates.length} 个模板`)
  } catch (e) {
    logTest('获取券模板列表', false, e.message)
  }

  // ========== 测试 3: 获取客户列表 ==========
  let customers = []
  try {
    const res = await wx.cloud.callFunction({ name: 'getCustomerList', data: {} })
    customers = (res.result && res.result.success && res.result.data) || []
    logTest('获取客户列表', customers.length > 0, `找到 ${customers.length} 个客户`)
  } catch (e) {
    logTest('获取客户列表', false, e.message)
  }

  // ========== 测试 4: 手动发券 ==========
  if (customers.length > 0 && templates.length > 0) {
    const testCustomer = customers[0]
    const testTemplate = templates.find(t => t.is_active) || templates[0]
    try {
      const res = await wx.cloud.callFunction({
        name: 'manualSendVoucher',
        data: {
          phone: testCustomer.phone,
          templateId: testTemplate._id
        }
      })
      logTest('手动发券', res.result && res.result.success, res.result ? res.result.msg : '调用失败')
    } catch (e) {
      logTest('手动发券', false, e.message)
    }
  } else {
    logTest('手动发券', false, '缺少测试数据（客户或模板）')
  }

  // ========== 测试 5: 生成活动码 ==========
  try {
    const res = await wx.cloud.callFunction({
      name: 'getActivityCode',
      data: { scene: 'test_auto_' + Date.now() }
    })
    logTest('生成活动码', res.result && res.result.success, res.result ? res.result.msg : '调用失败')
  } catch (e) {
    logTest('生成活动码', false, e.message)
  }

  // ========== 测试 6: 用户券列表 ==========
  try {
    const res = await wx.cloud.callFunction({ name: 'getUserVouchers', data: {} })
    const vouchers = (res.result && res.result.success && res.result.data) || []
    logTest('用户券列表', true, `找到 ${vouchers.length} 张券`)
  } catch (e) {
    logTest('用户券列表', false, e.message)
  }

  // ========== 测试 7: 营销规则 ==========
  try {
    const res = await wx.cloud.callFunction({ name: 'getMarketingRules', data: {} })
    const rules = (res.result && res.result.success && res.result.rules) || []
    logTest('营销规则', true, `找到 ${rules.length} 条规则`)
  } catch (e) {
    logTest('营销规则', false, e.message)
  }

  // ========== 输出报告 ==========
  console.log('\n' + '='.repeat(50))
  console.log('📊 测试报告')
  console.log('='.repeat(50))
  console.log(`总计: ${results.total} 项`)
  console.log(`✅ 通过: ${results.passed} 项`)
  console.log(`❌ 失败: ${results.failed} 项`)
  console.log('='.repeat(50))
  
  if (results.failed > 0) {
    console.log('\n❌ 失败详情:')
    results.details.filter(d => !d.success).forEach(d => {
      console.log(`  - ${d.name}: ${d.msg}`)
    })
  }
  
  return results
}

// 执行测试
runAutoTests().then(r => console.log('\n测试完成！')).catch(e => console.error('测试异常:', e))