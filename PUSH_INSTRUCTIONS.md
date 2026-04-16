# 推送到 GitHub：`store-assistant-miniprogram`

目标远程仓库：<https://github.com/davidatjfs-cyber/store-assistant-miniprogram>

## 1. 在本机进入本目录

本项目已独立到用户主目录，请在本仓库根目录操作：

```bash
cd /Users/magainze/store-assistant-miniprogram
```

若你使用其他路径下的克隆/副本，请 `cd` 到该副本根目录后再执行下面步骤。

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

使用 **Personal Access Token（PAT）** 完成 HTTPS 推送（GitHub **不再接受**账户登录密码）。

```bash
git push -u origin main
```

推送时终端会提示：

- **Username**：填你的 **GitHub 用户名**（例如 `davidatjfs-cyber`），不要填邮箱。
- **Password**：粘贴 **PAT**（以 `ghp_` 开头的 classic token，或 fine-grained token），**不要**填微信/GitHub 登录密码。

在 [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) 新建 token：classic 请勾选 **`repo`**；fine-grained 请对该仓库勾选 **Contents: Read and write**。

若远程已有提交且需覆盖（慎用，先备份）：

```bash
git push -u origin main --force
```

### 若出现 `Password authentication is not supported`

说明当前输入的是账户密码而非 PAT，请按上文改用 token。

### 关于复制命令时的 `#` 注释

在终端里单独一行输入 `# 使用 GitHub PAT…` 时，部分环境下会报 `command not found: #`。注释行不要复制执行，只执行 `git push` 等实际命令。

## 4. 安全提醒

- 不要将 `project.private.config.json`、任何密钥文件提交进 Git。
- `app.js` / `project.config.json` 中的 AppID、云环境 ID、客如云 AppID 等请按环境区分；对外协作前确认是否脱敏。
- PAT 等同于密码，不要发给他人或贴到聊天里；泄露后立刻在 GitHub 上 **Revoke** 并新建。
