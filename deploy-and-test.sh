#!/bin/bash
# deploy-and-test.sh - 企业微信关联功能部署测试
# 用法: bash deploy-and-test.sh

set -e

echo "========================================="
echo "  企业微信关联功能 - 部署测试"
echo "========================================="
echo

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ---- [1] 检查 .env.production ----
echo "[1/5] 检查环境配置..."
if [ -f .env.production ]; then
  echo "  ✅ .env.production 已存在"
  grep -q "wwc4222f318e24068" .env.production && echo "  ✅ 企业ID已配置" || echo "  ⚠️  企业ID未配置，请检查 .env.production"
else
  echo "  ⚠️  .env.production 不存在，跳过（云函数内已硬编码配置）"
fi
echo

# ---- [2] 检查云函数文件 ----
echo "[2/5] 检查云函数..."
CLOUD_FUNCTIONS="associateWecom queryWecomMapping sendWecomVoucher getWecomUserInfo"
ALL_OK=true

for fn in $CLOUD_FUNCTIONS; do
  if [ -f "cloudfunctions/$fn/index.js" ] && [ -f "cloudfunctions/$fn/config.json" ]; then
    echo "  ✅ $fn - index.js + config.json 存在"
  else
    echo "  ❌ $fn - 文件缺失！"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = false ]; then
  echo "  ❌ 有云函数文件缺失，请检查！"
  exit 1
fi
echo

# ---- [3] 检查前端页面 ----
echo "[3/5] 检查前端页面..."
PAGE_DIR="pages/user/send-to-wecom"
PAGE_FILES="send-to-wecom.js send-to-wecom.json send-to-wecom.wxml send-to-wecom.wxss"
PAGE_OK=true

for f in $PAGE_FILES; do
  if [ -f "$PAGE_DIR/$f" ]; then
    echo "  ✅ $f 存在"
  else
    echo "  ❌ $f 缺失！"
    PAGE_OK=false
  fi
done

if grep -q "send-to-wecom" app.json 2>/dev/null; then
  echo "  ✅ app.json 已注册页面路由"
else
  echo "  ❌ app.json 未注册页面路由！"
  PAGE_OK=false
fi

if [ "$PAGE_OK" = false ]; then
  echo "  ⚠️  前端页面有问题，请检查"
fi
echo

# ---- [4] 检查 app.js 云环境配置 ----
echo "[4/5] 检查云环境配置..."
if grep -q "cloud1-2gqo1169d58023d7" app.js 2>/dev/null; then
  echo "  ✅ 云环境ID已配置: cloud1-2gqo1169d58023d7"
else
  echo "  ⚠️  云环境ID未在app.js中找到，请检查"
fi
echo

# ---- [5] 生成部署指引 ----
echo "[5/5] 部署指引和测试"
echo
echo "========================================="
echo "  📋 所有文件检查完毕，以下是部署步骤："
echo "========================================="
echo
echo "👉 方式1: 使用微信开发者工具部署（推荐）"
echo "   1. 打开微信开发者工具"
echo "   2. 导入项目: $PROJECT_DIR"
echo "   3. 点击「云开发」→「云函数」"
echo "   4. 右键每个云函数目录 →「上传并部署：云端安装依赖」"
echo "   5. 需要部署的云函数："
echo "      - associateWecom"
echo "      - queryWecomMapping"
echo "      - sendWecomVoucher"
echo "      - getWecomUserInfo"
echo "   6. 点击「编译」测试小程序前端"
echo
echo "👉 方式2: 使用微信开发者CLI部署"
echo "   1. 安装CLI: npm install -g miniprogram-ci"
echo "   2. 运行: miniprogram-ci upload --pp . --pkp ./ privateKey路径 --appid wx8cb030fad5998252"
echo
echo "👉 测试企微关联流程："
echo "   1. 打开小程序 → 进入 '企业微信关联' 页面"
echo "   2. 点击「立即关联」→ 云函数创建映射记录"
echo "   3. 关联成功后 → 可发送优惠券到企微"
echo
echo "-------------------------------------------"
echo " ⚠️  企业微信后台需要额外配置："
echo "-------------------------------------------"
echo " 1. 登录 https://work.weixin.qq.com"
echo " 2. 进入应用管理 → 找到 AgentId=1000004 的应用"
echo " 3. 确认应用的「可见范围」包含目标客户"
echo " 4. 如需推送小程序消息，在应用内配置「小程序」关联"
echo
echo "========================================="
echo "  ✅ 部署检查完成！"
echo "========================================="