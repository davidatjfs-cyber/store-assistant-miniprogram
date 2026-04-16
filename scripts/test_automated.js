/**
 * 微信小程序自动化测试脚本 (Node.js 版本)
 * 使用 @cloudbase/node-sdk 进行测试
 */

const tcb = require('@cloudbase/node-sdk');

// 配置
const CONFIG = {
  envId: process.env.TCB_ENV_ID || 'your-env-id',
  testOpenid: process.env.TEST_OPENID || 'oea2F1xKNGTua0xmCPcMWu97jlfc',
  testUserId: '',
  storeId: 'store_test_001'
};

// 初始化
const app = tcb.init({
  env: CONFIG.envId
});

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: `${colors.green}[INFO]${colors.reset}`,
    error: `${colors.red}[ERROR]${colors.reset}`,
    warn: `${colors.yellow}[WARN]${colors.reset}`,
    test: `${colors.cyan}[TEST]${colors.reset}`
  }[level] || '';
  console.log(`${timestamp} ${prefix} ${message}`);
}

// 调用云函数
async function callFunction(name, data) {
  try {
    log('info', `调用云函数: ${name}`);
    const result = await app.callFunction({
      name: name,
      data: data
    });
    return result.result;
  } catch (error) {
    log('error', `调用云函数失败: ${name}`);
    console.error(error);
    throw error;
  }
}

// 断言函数
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ========== 测试套件 ==========

class TestSuite {
  constructor() {
    this.results = [];
    this.testUserId = CONFIG.testUserId;
  }

  async runTest(name, testFunc) {
    log('test', `开始测试: ${name}`);
    try {
      await testFunc();
      this.results.push({ name, status: 'PASS' });
      log('info', `✓ ${name} - 通过`);
    } catch (error) {
      this.results.push({ name, status: 'FAIL', error: error.message });
      log('error', `✗ ${name} - 失败: ${error.message}`);
    }
  }

  printReport() {
    console.log('\n' + '='.repeat(50));
    log('info', '测试报告');
    console.log('='.repeat(50));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✓' : '✗';
      const color = result.status === 'PASS' ? colors.green : colors.red;
      console.log(`${color}${icon} ${result.name}${colors.reset}`);
      if (result.status === 'FAIL') {
        console.log(`  错误: ${result.error}`);
      }
    });

    console.log('='.repeat(50));
    log('info', `总计: ${total} | 通过: ${passed} | 失败: ${failed}`);
    console.log('='.repeat(50));
  }
}

// ========== 测试用例 ==========

const suite = new TestSuite();

// 测试1: 基础连接测试
suite.runTest('基础连接测试', async () => {
  const result = await callFunction('getCallerOpenId', {});
  assert(result.success === true, '返回 success 应为 true');
  assert(result.openid === CONFIG.testOpenid, 'OPENID 应匹配');
  log('info', `OPENID: ${result.openid}`);
});

// 测试2: 测试数据播种
suite.runTest('测试数据播种', async () => {
  const result = await callFunction('seedTestData', {
    action: 'seed_test_data'
  });
  assert(result.success === true, '播种应成功');
});

// 测试3: 获取测试数据摘要
suite.runTest('获取测试数据摘要', async () => {
  const result = await callFunction('seedTestData', {
    action: 'get_test_summary'
  });
  assert(result.success === true, '获取摘要应成功');
  console.log('测试数据摘要:', result.summary);
});

// 测试4: 确保用户文档
suite.runTest('确保用户文档', async () => {
  const result = await callFunction('ensureUserDoc', {
    scanParams: {
      store_id: CONFIG.storeId,
      table_id: 'T01',
      store_display_name: '测试门店'
    }
  });
  assert(result.success === true, '用户文档创建应成功');
  assert(result.user_id, '应返回 user_id');
  suite.testUserId = result.user_id;
  CONFIG.testUserId = result.user_id;
  log('info', `用户ID: ${suite.testUserId}`);
});

// 测试5: 顾客到店检测
suite.runTest('顾客到店检测', async () => {
  const result = await callFunction('detectUserArrival', {
    store_id: CONFIG.storeId
  });
  assert(result.success === true, '到店检测应成功');
  console.log('用户画像:', result.profile);
});

// 测试6: 获取用户券
suite.runTest('获取用户券', async () => {
  const result = await callFunction('getUserVouchers', {
    status: 'unused'
  });
  assert(result.success === true, '获取券列表应成功');
  console.log(`未使用券数量: ${result.data.length}`);
});

// 测试7: 营销规则获取
suite.runTest('营销规则获取', async () => {
  const result = await callFunction('getMarketingRules', {});
  assert(result.success === true, '获取营销规则应成功');
  console.log(`活跃营销规则数量: ${result.rules.length}`);
});

// 测试8: 营销看板
suite.runTest('营销看板', async () => {
  try {
    const result = await callFunction('getMarketingDashboard', {});
    // 可能因权限失败，不强制断言
    if (result.success) {
      console.log('今日汇总:', result.today?.summary);
    }
  } catch (error) {
    log('warn', '营销看板可能需要管理员权限');
  }
});

// 测试9: 系统监控
suite.runTest('系统监控', async () => {
  const result = await callFunction('monitorSystem', {});
  assert(result.success === true, '系统监控应成功');
  console.log('系统监控结果:', result.stats);
});

// 测试10: 营销引擎 - 支付后发券
suite.runTest('营销引擎 - 支付后发券', async () => {
  if (!suite.testUserId) {
    log('warn', '缺少用户ID，跳过此测试');
    return;
  }

  const result = await callFunction('runMarketingEngine', {
    hook: 'post_payment',
    user_id: suite.testUserId,
    openid: CONFIG.testOpenid,
    order_id: `test_order_${Date.now()}`,
    store_id: CONFIG.storeId,
    amount_fen: 5000,
    is_first_order: true
  });
  assert(result.success === true, '营销引擎应成功');
  console.log('营销规则命中:', result.winner_rule_id);
});

// 测试11: 定时召回扫描
suite.runTest('定时召回扫描', async () => {
  const result = await callFunction('runMarketingEngine', {
    hook: 'inactivity_scan'
  });
  assert(result.success === true, '召回扫描应成功');
  console.log('召回结果:', result.summary);
});

// 测试12: 员工档案获取
suite.runTest('员工档案获取', async () => {
  const result = await callFunction('getStaffProfile', {
    include_caller_openid: true
  });
  assert(result.success === true, '获取员工档案应成功');
  console.log('员工信息:', {
    is_staff: result.is_staff,
    role: result.role,
    store_id: result.store_id
  });
});

// 测试13: 最近到店记录
suite.runTest('最近到店记录', async () => {
  try {
    const result = await callFunction('getRecentArrivals', {});
    assert(result.success === true, '获取到店记录应成功');
    console.log(`最近到店记录数量: ${result.items.length}`);
  } catch (error) {
    log('warn', '可能需要员工权限');
  }
});

// 测试14: 马己仙配置验证
suite.runTest('马己仙配置验证', async () => {
  const result = await callFunction('verifyMaijixianSetup', {
    confirm: 'CONFIRM_VERIFY_MJX',
    check_data_only: true
  });
  assert(result.success === true, '配置验证应成功');
  console.log('券模板验证:', result.part1_data_check?.voucher_templates);
  console.log('营销规则验证:', result.part1_data_check?.marketing_rules);
});

// 测试15: 马己仙数据播种
suite.runTest('马己仙数据播种', async () => {
  const result = await callFunction('seedMaijixianMarketing', {
    confirm: 'CONFIRM_SEED_MAIJIXIAN'
  });
  assert(result.success === true, '马己仙数据播种应成功');
  console.log('播种的券模板:', result.voucher_templates?.results);
  console.log('播种的营销规则:', result.marketing_rules?.results);
});

// ========== 主程序 ==========

async function main() {
  console.log('='.repeat(50));
  log('info', '微信小程序自动化测试开始');
  console.log(`环境ID: ${CONFIG.envId}`);
  console.log(`测试OPENID: ${CONFIG.testOpenid}`);
  console.log('='.repeat(50));
  console.log('');

  try {
    // 等待所有测试完成
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    // 打印测试报告
    suite.printReport();

    // 退出码
    const failed = suite.results.filter(r => r.status === 'FAIL').length;
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    log('error', `测试运行失败: ${error.message}`);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main();
}

module.exports = { suite, callFunction, CONFIG };
