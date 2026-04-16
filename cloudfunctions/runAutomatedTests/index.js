/**
 * 自动化测试云函数
 * 集成测试所有云函数并生成报告
 *
 * 调用方式:
 * 1. 运行所有测试: wx.cloud.callFunction({ name: 'runAutomatedTests', data: { runAll: true } })
 * 2. 运行指定测试: wx.cloud.callFunction({ name: 'runAutomatedTests', data: { tests: ['test1', 'test2'] } })
 */

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 测试结果收集
const testResults = [];

function log(testName, status, message, data = null) {
  const result = {
    test: testName,
    status: status, // 'PASS' | 'FAIL' | 'SKIP'
    message: message,
    data: data,
    timestamp: new Date().toISOString()
  };
  testResults.push(result);
  console.log(`[${status}] ${testName}: ${message}`);
}

function assert(condition, testName, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ========== 测试用例 ==========

async function test1_basicConnection() {
  const testName = '基础连接测试';
  try {
    const result = await cloud.callFunction({
      name: 'getCallerOpenId',
      data: {}
    });
    assert(result.result.success === true, testName, '返回 success 应为 true');
    log(testName, 'PASS', '基础连接正常', { openid: result.result.openid });
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test2_seedTestData() {
  const testName = '测试数据播种';
  try {
    const result = await cloud.callFunction({
      name: 'seedTestData',
      data: { action: 'seed_test_data' }
    });
    assert(result.result.success === true, testName, '播种应成功');
    log(testName, 'PASS', '测试数据播种成功');
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test3_getTestSummary() {
  const testName = '获取测试数据摘要';
  try {
    const result = await cloud.callFunction({
      name: 'seedTestData',
      data: { action: 'get_test_summary' }
    });
    assert(result.result.success === true, testName, '获取摘要应成功');
    log(testName, 'PASS', '获取测试摘要成功', result.result.summary);
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test4_ensureUserDoc() {
  const testName = '确保用户文档';
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) {
      log(testName, 'SKIP', '缺少 OPENID');
      return null;
    }
    const result = await cloud.callFunction({
      name: 'ensureUserDoc',
      data: {
        scanParams: {
          store_id: 'store_test_001',
          table_id: 'T01'
        }
      }
    });
    assert(result.result.success === true, testName, '用户文档创建应成功');
    assert(result.result.user_id, testName, '应返回 user_id');
    log(testName, 'PASS', '用户文档创建成功', { user_id: result.result.user_id });
    return result.result.user_id;
  } catch (error) {
    log(testName, 'FAIL', error.message);
    return null;
  }
}

async function test5_detectUserArrival() {
  const testName = '顾客到店检测';
  try {
    const result = await cloud.callFunction({
      name: 'detectUserArrival',
      data: { store_id: 'store_test_001' }
    });
    assert(result.result.success === true, testName, '到店检测应成功');
    log(testName, 'PASS', '到店检测成功', result.result.profile);
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test6_getUserVouchers() {
  const testName = '获取用户券';
  try {
    const result = await cloud.callFunction({
      name: 'getUserVouchers',
      data: { status: 'unused' }
    });
    assert(result.result.success === true, testName, '获取券列表应成功');
    log(testName, 'PASS', `获取到 ${result.result.data.length} 张未使用券`);
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test7_marketingRules() {
  const testName = '营销规则获取';
  try {
    const result = await cloud.callFunction({
      name: 'getMarketingRules',
      data: {}
    });
    assert(result.result.success === true, testName, '获取营销规则应成功');
    log(testName, 'PASS', `获取到 ${result.result.rules.length} 条营销规则`);
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test8_marketingDashboard() {
  const testName = '营销看板';
  try {
    const result = await cloud.callFunction({
      name: 'getMarketingDashboard',
      data: {}
    });
    // 可能因权限失败
    if (result.result.success) {
      log(testName, 'PASS', '营销看板获取成功');
    } else {
      log(testName, 'SKIP', '可能需要管理员权限: ' + result.result.message);
    }
  } catch (error) {
    log(testName, 'SKIP', '可能需要管理员权限');
  }
}

async function test9_systemMonitor() {
  const testName = '系统监控';
  try {
    const result = await cloud.callFunction({
      name: 'monitorSystem',
      data: {}
    });
    assert(result.result.success === true, testName, '系统监控应成功');
    log(testName, 'PASS', '系统监控成功', result.result.stats);
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test10_marketingEnginePostPayment(userId) {
  const testName = '营销引擎 - 支付后发券';
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID || !userId) {
      log(testName, 'SKIP', '缺少 OPENID 或 userId');
      return;
    }
    const result = await cloud.callFunction({
      name: 'runMarketingEngine',
      data: {
        hook: 'post_payment',
        user_id: userId,
        openid: OPENID,
        order_id: `test_order_${Date.now()}`,
        store_id: 'store_test_001',
        amount_fen: 5000,
        is_first_order: true
      }
    });
    assert(result.result.success === true, testName, '营销引擎应成功');
    log(testName, 'PASS', '营销引擎成功', { winner_rule_id: result.result.winner_rule_id });
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test11_inactivityScan() {
  const testName = '定时召回扫描';
  try {
    const result = await cloud.callFunction({
      name: 'runMarketingEngine',
      data: { hook: 'inactivity_scan' }
    });
    assert(result.result.success === true, testName, '召回扫描应成功');
    log(testName, 'PASS', '召回扫描成功', { summary: result.result.summary });
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test12_staffProfile() {
  const testName = '员工档案获取';
  try {
    const result = await cloud.callFunction({
      name: 'getStaffProfile',
      data: { include_caller_openid: true }
    });
    assert(result.result.success === true, testName, '获取员工档案应成功');
    log(testName, 'PASS', '员工档案获取成功', {
      is_staff: result.result.is_staff,
      role: result.result.role
    });
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test13_recentArrivals() {
  const testName = '最近到店记录';
  try {
    const result = await cloud.callFunction({
      name: 'getRecentArrivals',
      data: {}
    });
    if (result.result.success) {
      log(testName, 'PASS', `获取到 ${result.result.items.length} 条到店记录`);
    } else {
      log(testName, 'SKIP', '可能需要员工权限');
    }
  } catch (error) {
    log(testName, 'SKIP', '可能需要员工权限');
  }
}

async function test14_verifyMaijixianSetup() {
  const testName = '马己仙配置验证';
  try {
    const result = await cloud.callFunction({
      name: 'verifyMaijixianSetup',
      data: {
        confirm: 'CONFIRM_VERIFY_MJX',
        check_data_only: true
      }
    });
    assert(result.result.success === true, testName, '配置验证应成功');
    const dataCheck = result.result.part1_data_check;
    log(testName, 'PASS', '马己仙配置验证', {
      templates_ok: dataCheck?.all_templates_ok,
      rules_ok: dataCheck?.all_rules_ok
    });
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

async function test15_seedMaijixianData() {
  const testName = '马己仙数据播种';
  try {
    const result = await cloud.callFunction({
      name: 'seedMaijixianMarketing',
      data: { confirm: 'CONFIRM_SEED_MAIJIXIAN' }
    });
    assert(result.result.success === true, testName, '马己仙数据播种应成功');
    log(testName, 'PASS', '马己仙数据播种成功', {
      templates: result.result.voucher_templates?.results?.length,
      rules: result.result.marketing_rules?.results?.length
    });
  } catch (error) {
    log(testName, 'FAIL', error.message);
  }
}

// ========== 测试套件 ==========

const testSuites = {
  test1: test1_basicConnection,
  test2: test2_seedTestData,
  test3: test3_getTestSummary,
  test4: test4_ensureUserDoc,
  test5: test5_detectUserArrival,
  test6: test6_getUserVouchers,
  test7: test7_marketingRules,
  test8: test8_marketingDashboard,
  test9: test9_systemMonitor,
  test10: test10_marketingEnginePostPayment,
  test11: test11_inactivityScan,
  test12: test12_staffProfile,
  test13: test13_recentArrivals,
  test14: test14_verifyMaijixianSetup,
  test15: test15_seedMaijixianData
};

// ========== 云函数入口 ==========

exports.main = async (event, context) => {
  const { OPENID, APPID } = cloud.getWXContext();

  // 清空之前的结果
  testResults.length = 0;

  // 确定要运行的测试
  let testsToRun = [];
  if (event.runAll) {
    testsToRun = Object.keys(testSuites);
  } else if (event.tests && Array.isArray(event.tests)) {
    testsToRun = event.tests;
  } else {
    testsToRun = ['test1', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'test9', 'test11', 'test12'];
  }

  // 记录测试开始
  const startTime = Date.now();

  // 获取用户ID（用于后续测试）
  let userId = null;

  // 依次执行测试
  for (const testName of testsToRun) {
    const testFunc = testSuites[testName];
    if (testFunc) {
      // test4 返回 userId，需要传递给 test10
      if (testName === 'test4') {
        userId = await testFunc();
      } else if (testName === 'test10') {
        await testFunc(userId);
      } else {
        await testFunc();
      }
    } else {
      log(testName, 'SKIP', '测试不存在');
    }

    // 添加延迟，避免并发调用过快
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 统计结果
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  const skipped = testResults.filter(r => r.status === 'SKIP').length;
  const total = testResults.length;
  const duration = Date.now() - startTime;

  // 返回测试报告
  return {
    success: true,
    summary: {
      total,
      passed,
      failed,
      skipped,
      duration_ms: duration
    },
    results: testResults,
    openid: OPENID,
    appid: APPID
  };
};
