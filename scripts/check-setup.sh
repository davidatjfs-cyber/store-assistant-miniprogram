#!/bin/bash

# 门店私域助手 - 快速配置检查脚本

set -e

echo "🚀 门店私域助手 - 配置检查"
echo "======================================"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_ROOT="/Users/magainze/store-assistant-miniprogram"
cd "$PROJECT_ROOT"

# 检查 1: 项目结构
echo -e "\n📁 1. 检查项目结构..."
REQUIRED_DIRS=("pages" "cloudfunctions" "utils" "docs" "scripts")
REQUIRED_FILES=("app.js" "app.json" "project.config.json" "package.json")

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} 目录 $dir 存在"
    else
        echo -e "${RED}✗${NC} 目录 $dir 不存在"
    fi
done

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} 文件 $file 存在"
    else
        echo -e "${RED}✗${NC} 文件 $file 不存在"
    fi
done

# 检查 2: 云环境配置
echo -e "\n☁️  2. 检查云环境配置..."
CLOUD_ENV=$(grep "CLOUD_ENV_ID" app.js | grep -v "^//" | grep -v "YOUR_CLOUD_ENV_ID" | grep "cloud" || echo "")

if [ -n "$CLOUD_ENV" ]; then
    echo -e "${GREEN}✓${NC} 云环境 ID 已配置"
    echo "  $CLOUD_ENV"
else
    echo -e "${YELLOW}⚠${NC} 云环境 ID 未配置，请在 app.js:7 中设置"
fi

# 检查 3: 依赖安装
echo -e "\n📦 3. 检查依赖安装..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} 根目录依赖已安装"
else
    echo -e "${YELLOW}⚠${NC} 根目录依赖未安装，运行: npm install"
fi

# 检查 4: 云函数依赖
echo -e "\n⚙️  4. 检查云函数依赖..."
CLOUD_FUNCTIONS=("createPayment" "paymentCallback" "saveUserPhone" "getUserVouchers" "verifyVoucher" "revertVoucher" "getStaffProfile" "runMarketingEngine" "dailyCheckInactiveUsers")

for func in "${CLOUD_FUNCTIONS[@]}"; do
    if [ -f "cloudfunctions/$func/package.json" ]; then
        if [ -d "cloudfunctions/$func/node_modules" ]; then
            echo -e "${GREEN}✓${NC} $func 依赖已安装"
        else
            echo -e "${YELLOW}⚠${NC} $func 依赖未安装"
        fi
    else
        echo -e "${RED}✗${NC} $func package.json 不存在"
    fi
done

# 检查 5: 页面文件
echo -e "\n📱 5. 检查页面文件..."
PAGES=("index/index" "voucher/list" "voucher/detail" "staff/verify" "admin/marketing" "admin/dashboard")

for page in "${PAGES[@]}"; do
    if [ -f "pages/$page.js" ] && [ -f "pages/$page.wxml" ] && [ -f "pages/$page.wxss" ] && [ -f "pages/$page.json" ]; then
        echo -e "${GREEN}✓${NC} 页面 $page 完整"
    else
        echo -e "${RED}✗${NC} 页面 $page 不完整"
    fi
done

# 检查 6: 工具文件
echo -e "\n🛠️  6. 检查工具文件..."
if [ -f "utils/weapp.qrcode.js" ]; then
    echo -e "${GREEN}✓${NC} 二维码工具文件存在"
else
    echo -e "${RED}✗${NC} 二维码工具文件缺失"
fi

# 检查 7: 文档文件
echo -e "\n📖 7. 检查文档文件..."
DOCS=("README.md" "DEPLOYMENT_GUIDE.md" "SETUP_AND_TEST_GUIDE.md" "docs/MARKETING.md" "docs/VOUCHER_DATABASE.md")

for doc in "${DOCS[@]}"; do
    if [ -f "$doc" ]; then
        echo -e "${GREEN}✓${NC} 文档 $doc 存在"
    else
        echo -e "${YELLOW}⚠${NC} 文档 $doc 不存在"
    fi
done

# 检查 8: AppID 配置
echo -e "\n🆔 8. 检查小程序配置..."
APPID=$(grep '"appid"' project.config.json | grep -o '"wx[a-zA-Z0-9]\{16\}"' | head -1)

if [ -n "$APPID" ]; then
    echo -e "${GREEN}✓${NC} AppID 已配置: $APPID"
else
    echo -e "${YELLOW}⚠${NC} AppID 未配置"
fi

# 总结
echo -e "\n======================================"
echo "📋 配置检查完成"
echo ""
echo "📝 下一步操作："
echo "1. 在微信开发者工具中打开项目"
echo "2. 确认云环境 ID 已配置（app.js:7）"
echo "3. 在云开发控制台创建数据库集合"
echo "4. 上传部署云函数"
echo "5. 按照 SETUP_AND_TEST_GUIDE.md 进行测试"
echo ""
echo "📚 完整指南：查看 SETUP_AND_TEST_GUIDE.md"
