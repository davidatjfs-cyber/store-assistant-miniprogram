# 推送到 GitHub：`store-assistant-miniprogram`

目标远程仓库：<https://github.com/davidatjfs-cyber/store-assistant-miniprogram>

## 1. 在本机进入本目录

若你使用当前工作区中的副本：

```bash
cd /Users/magainze/HRMS/store-assistant-miniprogram
```

也可将同目录复制到你习惯的路径后再执行下面步骤。

## 2. 初始化并提交

```bash
git init -b main
git add -A
git status
git commit -m "feat: split store-assistant-miniprogram from financial-expert monorepo"
```

## 3. 关联远程并推送

若远程为空仓库：

```bash
git remote add origin https://github.com/davidatjfs-cyber/store-assistant-miniprogram.git
```

使用 **Personal Access Token（classic，勾选 repo）** 作为 HTTPS 密码，或使用 SSH：

```bash
git push -u origin main
```

若远程已有提交且需覆盖（慎用，先备份）：

```bash
git push -u origin main --force
```

## 4. 后续与 `financial-expert` 的关系

- 小程序以本仓库为 **canonical**；`financial-expert` 内同名目录可改为子模块链接本仓库，或删除并在 README 中指向本仓库，避免双份漂移。

## 5. 安全提醒

- 不要将 `project.private.config.json`、任何密钥文件提交进 Git。
- `app.js` / `project.config.json` 中的 AppID、云环境 ID、客如云 AppID 等请按环境区分；对外协作前确认是否脱敏。
