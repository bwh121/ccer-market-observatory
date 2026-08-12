# CEA 核查机构 PDF 数据流水线

这套流水线把全国碳市场信息网“核查机构信息公开”列表及其 PDF 附件转换成网页可直接使用的数据。

## 处理流程

1. `update-cets-verification.mjs` 连接由系统正常启动的专用 Edge，通过公开网页状态读取完整列表和附件地址，核对官网总数并断点下载 PDF。
2. `parse_verification_pdfs.py` 提取机构基本信息、法定代表人、注册资金、办公场所、联系人、联系方式、不良记录、核查对象和合格率。
3. 解析器生成 JSON、UTF-8 CSV 和质量报告。PDF 无文本、字段缺失、目标数不一致或列表匹配失败时，会进入复核队列。
4. 发布闸门要求公开列表逐条有结论：PDF 已解析，或官网确实未附 PDF，或官网已公开但附件链接失效；任何未解释缺口、重复主键或解析错误都会阻止候选数据替换 `public/data/cea-verification.json`。
5. `sync-verification-dashboard.mjs` 把通过门槛的数据同步到 CEA 页面；失败时线上继续使用上一版完整数据。

## 自动更新

`.github/workflows/update-cets-verification.yml` 在工作日北京时间 20:30 自动运行，也支持手工触发。由于官网会拒绝无状态的云端浏览器，任务使用带 `cets-collector` 标签的 Windows 自托管运行器。仓库变量 `CETS_PROFILE_DIR` 指向专用 Edge 配置目录；持久 PDF 缓存默认位于 `C:\actions-runner-ccer\cets-work`，也可由可选变量 `CETS_WORK_DIR` 覆盖。浏览器由系统正常启动，再通过仅监听本机的调试端口交给采集器。成功的数据提交会触发现有 GitHub Pages 发布流程；失败时会保留旧数据、上传诊断文件并创建或更新告警 Issue。

网站可能在新的浏览器环境要求一次安全验证。首次本地采集可使用 `--headed --interactive --profile-dir <专用目录>`，验证完成后专用浏览器目录可供后续断点更新使用。流水线不会读取用户日常浏览器的 Cookie 或配置。

保留本地 Codex 定时任务作为失败后的复核通道。主更新通道不读取用户日常浏览器的 Cookie、历史记录或配置。

列表记录保留官网内部记录 ID、年度、行业、机构、发布单位和发布时间；PDF 采用去除临时签名参数后的稳定地址缓存。官网把同一发布批次的多个年度或行业记录合并到一个附件时，仅在该批次所有已公开地址完全一致的情况下关联同一 PDF。

正式启用定时更新前，需要在专用 Windows 机器上完成三项一次性配置：安装 GitHub Actions 自托管运行器并添加 `cets-collector` 标签；建立仅用于本项目的 Edge 配置目录；在该目录中打开官网并完成首次安全验证。质量闸门与页面发布均不依赖人工确认。

## 主要产物

- `public/data/cea-verification.json`：网页使用的机构详情、机构—企业关系和质量报告。
- `public/data/exports/verification-details.csv`：机构及 PDF 解析详情表。
- `public/data/exports/verification-targets.csv`：机构—重点排放单位关系表。
- `public/data/exports/verification-pdf-quality.json`：完整性、重复项和复核队列。
