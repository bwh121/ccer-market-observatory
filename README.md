# 全国 CCER 市场研究观测站

科研风格的交互式仪表板，汇总全国 CCER 市场交易、项目开发、项目业主以及审定与核查机构信息。

## 本地运行

```bash
pnpm install
pnpm run dev
```

访问 `http://localhost:3000`。数据文件由 `scripts/generate-dashboard-data.mjs` 从项目目录中的结构化采集结果生成。

## 质量校验

```bash
pnpm run lint
pnpm run test
```

站点不使用数据库；地图底图与仪表板数据均作为静态资源随版本发布。
