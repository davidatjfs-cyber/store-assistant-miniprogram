#!/usr/bin/env bash
# 一键安装所有云函数依赖（需在「微信开发者工具」中手动上传并部署各云函数目录）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF="$ROOT/cloudfunctions"
for name in \
  createPayment \
  paymentCallback \
  saveUserPhone \
  getUserVouchers \
  verifyVoucher \
  revertVoucher \
  migrateUsers \
  getStaffProfile \
  getCallerOpenId \
  detectUserArrival \
  getRecentArrivals \
  updateCustomerProfile \
  runMarketingEngine \
  dailyCheckInactiveUsers \
  monitorSystem \
  getMarketingDashboard \
  getMarketingRules \
  updateMarketingRule \
  batchTableCodes \
  exportTableCodesPdf \
  seedMaijixianMarketing \
  verifyMaijixianSetup
do
  if [[ -d "$CF/$name" ]]; then
    echo "==> npm install in $name"
    (cd "$CF/$name" && npm install)
  else
    echo "WARN: 跳过不存在的目录 $name"
  fi
done
echo ""
echo "依赖安装完成。请打开微信开发者工具 → 云开发 → 右键各云函数目录 →「上传并部署：云端安装依赖」。"
echo "若已本地执行过 npm install，也可使用「上传并部署：所有文件」。"
