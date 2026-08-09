# 导出账号服务配置

网站的保存图片和下载数据功能使用 Supabase Auth 与数据库配额控制。未完成本页配置前，公开站点会默认关闭导出，避免前端本地计数被绕过。

## 1. 创建 Supabase 项目

1. 创建一个 Supabase 项目，记录项目 URL 和 Publishable key。不要在 GitHub 或前端使用 service role key。
2. 在 Authentication 中启用手机号加密码注册、手机号确认，并配置一个支持目标用户地区的短信服务商。
3. 根据实际使用量设置保守的短信发送频率限制。若后续需要启用 CAPTCHA，须先在注册表单接入对应验证码控件并传递验证令牌，再在 Supabase 后台开启。

## 2. 创建配额表和函数

在 Supabase SQL Editor 中执行：

`supabase/migrations/20260809_export_access.sql`

该迁移按 Asia/Shanghai 自然日原子计数，同一账号每天最多允许两次保存图片或下载数据。

## 3. 配置 GitHub Pages

在 GitHub 仓库 `Settings > Secrets and variables > Actions > Variables` 中新增：

- `SUPABASE_URL`：Supabase 项目 URL
- `SUPABASE_PUBLISHABLE_KEY`：Supabase Publishable key

重新运行 `Deploy GitHub Pages` 工作流后，构建会把这两个公开客户端配置注入网页。不要把短信服务商密钥或 Supabase service role key 配置成构建变量。

## 4. 上线前验收

使用测试手机号完成注册、短信验证和登录。连续导出两次应成功，第三次应提示当日额度已用完；次日北京时间 00:00 后额度应恢复。
