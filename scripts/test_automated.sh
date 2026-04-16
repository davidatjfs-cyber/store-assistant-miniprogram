#!/bin/bash

# 微信小程序自动化测试脚本
# 使用云开发 CLI 进行测试

ENV_ID="your-env-id"
TEST_OPENID="oea2F1xKNGTua0xmCPcMWu97jlfc"
TEST_USER_ID=""
STORE_ID="store_test_001"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 调用云函数
call_function() {
    local func_name=$1
    local data=$2
    log_info "调用云函数: $func_name"
    echo "数据: $data"
    tcb functions call "$func_name" --data "$data"
}

# ========== 测试套件 ==========

# 测试1: 基础连接测试
test_basic_connection() {
    log_info "========== 测试1: 基础连接测试 =========="
    local result=$(call_function "getCallerOpenId" "{}")
    echo "$result" | grep -q '"success":true'
    if [ $? -eq 0 ]; then
        log_info "✓ 基础连接测试通过"
    else
        log_error "✗ 基础连接测试失败"
        return 1
    fi
}

# 测试2: 测试数据播种
test_seed_data() {
    log_info "========== 测试2: 测试数据播种 =========="
    local result=$(call_function "seedTestData" '{"action":"seed_test_data"}')
    echo "$result" | grep -q '"success":true'
    if [ $? -eq 0 ]; then
        log_info "✓ 测试数据播种成功"
    else
        log_warn "测试数据可能已存在"
    fi
}

# 测试3: 获取测试数据摘要
test_get_summary() {
    log_info "========== 测试3: 获取测试数据摘要 =========="
    call_function "seedTestData" '{"action":"get_test_summary"}'
}

# 测试4: 确保用户文档
test_ensure_user() {
    log_info "========== 测试4: 确保用户文档 =========="
    local result=$(call_function "ensureUserDoc" '{"scanParams":{"store_id":"'"$STORE_ID"'","table_id":"T01"}}')
    echo "$result" | grep -q '"success":true'
    if [ $? -eq 0 ]; then
        log_info "✓ 用户文档创建成功"
        TEST_USER_ID=$(echo "$result" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)
        log_info "用户ID: $TEST_USER_ID"
    else
        log_error "✗ 用户文档创建失败"
        return 1
    fi
}

# 测试5: 顾客到店检测
test_detect_arrival() {
    log_info "========== 测试5: 顾客到店检测 =========="
    call_function "detectUserArrival" "{\"store_id\":\"$STORE_ID\"}"
}

# 测试6: 获取用户券
test_get_user_vouchers() {
    log_info "========== 测试6: 获取用户券 =========="
    call_function "getUserVouchers" '{"status":"unused"}'
}

# 测试7: 营销规则获取
test_marketing_rules() {
    log_info "========== 测试7: 营销规则获取 =========="
    call_function "getMarketingRules" '{}'
}

# 测试8: 营销看板
test_marketing_dashboard() {
    log_info "========== 测试8: 营销看板 =========="
    log_warn "此测试需要管理员权限"
    call_function "getMarketingDashboard" '{}'
}

# 测试9: 系统监控
test_system_monitor() {
    log_info "========== 测试9: 系统监控 =========="
    call_function "monitorSystem" '{}'
}

# 测试10: 营销引擎 - 支付后发券（模拟）
test_marketing_engine_post_payment() {
    log_info "========== 测试10: 营销引擎 - 支付后发券 =========="
    if [ -z "$TEST_USER_ID" ]; then
        log_warn "缺少用户ID，跳过此测试"
        return
    fi
    call_function "runMarketingEngine" "{
        \"hook\": \"post_payment\",
        \"user_id\": \"$TEST_USER_ID\",
        \"openid\": \"$TEST_OPENID\",
        \"order_id\": \"test_order_$(date +%s)\",
        \"store_id\": \"$STORE_ID\",
        \"amount_fen\": 5000,
        \"is_first_order\": true
    }"
}

# 测试11: 定时召回扫描
test_inactivity_scan() {
    log_info "========== 测试11: 定时召回扫描 =========="
    call_function "runMarketingEngine" '{"hook":"inactivity_scan"}'
}

# 测试12: 员工档案获取
test_staff_profile() {
    log_info "========== 测试12: 员工档案获取 =========="
    call_function "getStaffProfile" '{"include_caller_openid":true}'
}

# 测试13: 最近到店记录
test_recent_arrivals() {
    log_info "========== 测试13: 最近到店记录 =========="
    call_function "getRecentArrivals" '{}'
}

# 测试14: 马己仙配置验证
test_verify_maijixian() {
    log_info "========== 测试14: 马己仙配置验证 =========="
    call_function "verifyMaijixianSetup" '{
        "confirm": "CONFIRM_VERIFY_MJX",
        "check_data_only": true
    }'
}

# 测试15: 马己仙数据播种
test_seed_maijixian() {
    log_info "========== 测试15: 马己仙数据播种 =========="
    call_function "seedMaijixianMarketing" '{"confirm":"CONFIRM_SEED_MAIJIXIAN"}'
}

# ========== 主程序 ==========

main() {
    log_info "========================================="
    log_info "微信小程序自动化测试开始"
    log_info "环境ID: $ENV_ID"
    log_info "测试OPENID: $TEST_OPENID"
    log_info "========================================="

    # 执行测试
    test_basic_connection || exit 1
    test_seed_data
    test_get_summary
    test_ensure_user
    test_detect_arrival
    test_get_user_vouchers
    test_marketing_rules
    test_marketing_dashboard
    test_system_monitor
    test_marketing_engine_post_payment
    test_inactivity_scan
    test_staff_profile
    test_recent_arrivals
    test_verify_maijixian
    test_seed_maijixian

    log_info "========================================="
    log_info "自动化测试完成"
    log_info "========================================="
}

# 执行主程序
main "$@"
