# 邮箱账号与私有导出服务配置

网站使用 Supabase Auth、Postgres、Private Storage 和 Edge Functions 管理账号与导出。密码、Session、邮箱验证和密码找回均由 Supabase Auth 处理，网站不保存明文密码。

## 1. 数据库与私有存储

按顺序执行以下迁移：

1. `supabase/migrations/20260809_export_access.sql`
2. `supabase/migrations/20260810_email_auth_private_exports.sql`
3. `supabase/migrations/20260811_harden_export_delivery.sql`
4. `supabase/migrations/20260811_harden_export_security.sql`
5. `supabase/migrations/20260811_restrict_quota_rpc.sql`

这些迁移会创建并加固：

- `free`、`pro`、`institutional` 套餐及用户档案；只有 `free` 当前启用，每日额度为 2 次。
- 按 Asia/Shanghai 自然日计算的服务端原子配额。
- 逐次导出记录以及失败回滚函数。
- 非公开的 `ccer-private-exports` Storage bucket。前端没有直接读取策略，只能通过 Signed URL 下载。

## 2. Edge Function

部署 `supabase/functions/export-download/index.ts`：

```bash
supabase functions deploy export-download --project-ref rqujxecmlhoomaacwdlz
```

Supabase 会向函数提供 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。service role key 只能保留在 Supabase Function 环境中，不得进入 GitHub 变量或前端代码。

函数会验证登录 Session、扣减额度、上传导出文件、记录 Storage 路径并返回 120 秒有效的 Signed URL。上传或签名失败时会回滚本次额度。

## 3. 邮箱认证

在 Supabase `Authentication > Sign In / Providers` 中：

1. 启用 Email provider。
2. 开启 Confirm email，注册必须通过验证邮件完成。
3. Site URL 和 Redirect URL 均设置为 `https://bwh121.github.io/ccer-market-observatory/`。
4. 关闭不再使用的 Phone provider。

日常登录使用邮箱和密码。找回密码通过 Supabase recovery email 返回网站后设置新密码。

## 4. Resend 邮件

可先使用 Supabase 内置邮件服务做小规模测试。正式开放注册前，建议在 `Authentication > SMTP Settings` 配置 Resend：

- Host：`smtp.resend.com`
- Port：`465` 或 `587`
- Username：`resend`
- Password：Resend API key
- Sender：已在 Resend 验证域名下的发件地址

Resend API key 只在 Supabase SMTP 设置中填写，不放入仓库或聊天记录。

## 5. Cloudflare Turnstile

1. 在 Cloudflare 创建 Turnstile 站点，允许域名 `bwh121.github.io`。
2. 将 Site key 保存为 GitHub Actions 仓库变量 `TURNSTILE_SITE_KEY`。
3. 将 Secret key 直接填入 Supabase `Authentication > Attack Protection > CAPTCHA`，选择 Cloudflare Turnstile。

前端会在注册、重新发送验证邮件和找回密码入口传递 CAPTCHA token。Secret key 不得进入 GitHub 或前端。

## 6. GitHub Pages 构建变量

仓库 `Settings > Secrets and variables > Actions > Variables` 支持：

- `SUPABASE_URL`：可选；部署流程已有当前项目公共地址兜底。
- `SUPABASE_PUBLISHABLE_KEY`：可选；部署流程已有当前公开密钥兜底，轮换密钥时应更新变量。
- `TURNSTILE_SITE_KEY`：正式开放注册前必须配置。

Publishable key 和 Turnstile Site key 可以公开；Supabase service role key、Resend API key 和 Turnstile Secret key必须只保存在对应后端平台。

## 7. 上线验收

1. 注册邮箱收到验证邮件，点击后回到网站并成功登录。
2. 邮箱和密码可直接再次登录。
3. 忘记密码邮件可进入新密码设置页。
4. 账户窗口显示邮箱、套餐和当日剩余次数。
5. 前两次导出返回私有 Signed URL，第三次返回额度用完。
6. 未登录调用配额、Storage 对象或 Edge Function均被拒绝。
