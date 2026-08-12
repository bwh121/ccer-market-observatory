# CEA 核查机构 PDF 数据流水线

这套流水线把全国碳市场信息网“核查机构信息公开”列表及其 PDF 附件转换成网页可直接使用的数据。

## 处理流程

1. `update-cets-verification.mjs` 通过公开网页读取完整列表和附件地址，按 40 条/页核对总数，并断点下载 PDF。
2. `parse_verification_pdfs.py` 提取机构基本信息、法定代表人、注册资金、办公场所、联系人、联系方式、不良记录、核查对象和合格率。
3. 解析器生成 JSON、UTF-8 CSV 和质量报告。PDF 无文本、字段缺失、目标数不一致或列表匹配失败时，会进入复核队列。
4. 只有当 1,325 条公开记录全部匹配、没有重复主键且没有错误时，候选数据才会原子替换 `public/data/cea-verification.json`。
5. `sync-verification-dashboard.mjs` 把通过门槛的数据同步到 CEA 页面；失败时线上继续使用上一版完整数据。

## 自动更新

`.github/workflows/update-cets-verification.yml` 在工作日北京时间 20:30 自动运行，也支持手工触发。由于官网会拒绝无状态的云端浏览器，任务使用带 `cets-collector` 标签的 Windows 自托管运行器，并通过仓库变量 `CETS_PROFILE_DIR` 指向专用 Edge 配置目录。成功的数据提交会触发现有 GitHub Pages 发布流程；失败时会保留旧数据、上传诊断文件并创建或更新告警 Issue。

网站可能在新的浏览器环境要求一次安全验证。首次本地采集可使用 `--headed --interactive --profile-dir <专用目录>`，验证完成后专用浏览器目录可供后续断点更新使用。流水线不会读取用户日常浏览器的 Cookie 或配置。

正式启用定时更新前，需要在专用 Windows 机器上完成三项一次性配置：安装 GitHub Actions 自托管运行器并添加 `cets-collector` 标签；建立仅用于本项目的 Edge 配置目录；在该目录中打开官网并完成首次安全验证。质量闸门与页面发布均不依赖人工确认。

## 主要产物

- `public/data/cea-verification.json`：网页使用的机构详情、机构—企业关系和质量报告。
- `public/data/exports/verification-details.csv`：机构及 PDF 解析详情表。
- `public/data/exports/verification-targets.csv`：机构—重点排放单位关系表。
- `public/data/exports/verification-pdf-quality.json`：完整性、重复项和复核队列。
