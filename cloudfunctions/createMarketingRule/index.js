// 营销触发规则的管理（新增/编辑/删除/启停）已统一收归 HRMS 后台。
// 小程序仅作只读镜像（marketing_rules 由 syncMarketingRules 从 HRMS 拉取），
// 本函数不再写入任何规则，调用一律拒绝并引导到 HRMS。
exports.main = async function () {
  return {
    success: false,
    code: 'MOVED_TO_HRMS',
    message: '营销规则已统一在 HRMS 后台管理，请前往「增长 → 自动营销 → 支付发券」配置。小程序仅展示生效规则。'
  };
};
