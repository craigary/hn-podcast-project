# AGENTS.md

本文件面向在本仓库工作的自动化 Agent / 编码助手，目标是让你快速、准确地完成修改并避免破坏现有流程。

## 0) 项目概览

- 项目名：`hn-podcast-project`（HN 瞎聊）
- 类型：`pnpm workspace` monorepo（不是 Bun workspace）
- 语言：TypeScript（前端 Astro + 生成器 Node 脚本）
- 核心链路：抓取 HN 热门 -> AI 生成大纲与对话 -> Azure TTS + FFmpeg 合成音频 -> 上传 R2 -> 生成 episode markdown -> Astro 站点展示与 RSS 输出

## 1) 工作区结构

```txt
apps/
  web/         # Astro 6 beta 网站（内容展示 + RSS）
  generator/   # 播客生成流水线（tsx 执行）
packages/
  config/      # 共享配置（站点、主持人、模型、平台链接）
```

关键目录：

- `apps/web/src/content/episodes/*.md`：节目内容源（最终发布内容）
- `apps/generator/steps/*`：生成步骤（analyze / blueprint / script / image）
- `apps/generator/utils/*`：TTS、HN 抓取、markdown 转换、存储等
- `packages/config/index.ts`：站点与播客公共配置

## 2) 包管理与运行命令（以仓库根目录执行）

## 安装

- `pnpm install`

## 开发/构建

- `pnpm run dev`：启动网站开发环境（等价 `pnpm --filter web dev`）
- `pnpm run build`：构建网站（等价 `pnpm --filter web build`）
- `pnpm run preview`：预览构建产物

## 生成播客

- `pnpm run gen`：自动生成下一期
- `pnpm run gen -- --episode 15`：指定期数
- `pnpm run gen -- --date 2026-02-20`：指定 HN 抓取日期
- `pnpm run gen -- --episode 15 --force`：覆盖已有期数文件

说明：

- `--episode`、`--date`、`--force` 在 `apps/generator/main.ts` 中解析
- 若未指定 `--date`，默认按 HN 时区策略取“昨天”
- 新期 markdown 写入 `apps/web/src/content/episodes/{episode}.md`

## 辅助命令

- `pnpm --filter generator sync-kv`：把本地最新期数同步到 Cloudflare KV
- `pnpm run lint`：ESLint（带 `--fix`）
- `pnpm run format`：Prettier

## 3) 生成流水线（apps/generator）

入口：`apps/generator/main.ts`

执行顺序（高层）：

1. 解析 CLI 参数，确定 `episode`/`date`，检查是否覆盖
2. 从 HN Algolia 抓取候选故事（按日期 + points 过滤）
3. `analyze`：抓正文/评论并生成结构化情报（可缓存 KV）
4. `blueprint`：生成整期结构（分段、选题、氛围）
5. `image`：生成封面提示词并拉取封面图
6. `script`：生成 intro / segment / outro 对话脚本
7. `tts`：Azure TTS 合成语音，FFmpeg 混音、转场、封面嵌入
8. 上传 `audio.mp3`、`cover.png`、`script.json`、`blueprint.json` 到 R2
9. 转换为 Astro content markdown，写入 `apps/web/src/content/episodes/`
10. 更新 KV 最新期数（仅生成新期时）

产物路径（R2）：

- `episodes/{date}/blueprint.json`
- `episodes/{date}/script.json`
- `episodes/{date}/cover.png`
- `episodes/{date}/audio.mp3`

## 4) 运行环境与外部依赖

建议：

- Node.js 22（与 CI 保持一致）
- 系统需可用 `ffmpeg` 与 `ffprobe`（音频步骤依赖）

主要环境变量（生成器）：

- AI：
  - `CEREBRAS_API_KEY`
  - `MISTRAL_API_KEY`
  - `OPENAI_API_KEY`
  - `LONGCAT_API_KEY`
  - `POLLINATIONS_API_KEY`
- Cloudflare：
  - `CF_ACCOUNT_ID`
  - `CF_API_TOKEN`
  - `CF_KV_NAMESPACE_ID`
  - `CF_R2_ACCESS_KEY_ID`
  - `CF_R2_SECRET_ACCESS_KEY`
  - `CF_R2_BUCKET`
  - `CF_R2_PUBLIC_URL`

注意：

- `apps/generator/sync-kv.ts` 只需要 KV 相关变量
- 缺少 R2/KV/AI 任一关键变量都会导致对应步骤失败

## 5) Web 端要点（apps/web）

- 框架：Astro `6.0.0-beta.14` + Tailwind CSS v4
- RSS：`apps/web/src/pages/rss.xml.ts`
- 内容 schema：`apps/web/src/content.config.ts`
- 部署配置：`apps/web/wrangler.jsonc`（静态资产目录 `dist`）

内容来源是 `src/content/episodes/*.md` frontmatter + transcript，修改 schema 时务必同步生成器 markdown 输出结构。

## 6) 代码风格与约定

- 全仓库统一 Prettier：`singleQuote: true`、`semi: false`
- 生成器代码以 ESM `import` 为主，保持无分号风格
- 站点 UI 文案和注释以中文（zh-CN）为主，新增内容保持一致语境
- 不要无意义重排现有 episode 内容文件；它们是发布内容的一部分

## 7) 自动化与 CI

GitHub Actions：

- `/.github/workflows/generate-episode.yml`
  - 定时任务每天 UTC 08:00
  - 支持手动触发并传 `episode/date/force`
  - 成功后自动提交 `apps/web/src/content/episodes/` 下新增或变更文件
- `/.github/workflows/sync-kv.yml`
  - 手动触发同步 KV 期数

## 8) Agent 执行建议（重要）

1. 先读 `package.json` 与相关 workspace `package.json`，再执行命令，避免误用包管理器。
2. 涉及 episode 生成逻辑时，优先从 `apps/generator/main.ts` 和 `steps/*` 入手。
3. 修改 markdown schema 前，检查：
   - `apps/web/src/content.config.ts`
   - `apps/generator/utils/markdown.ts`
   - 已有 `apps/web/src/content/episodes/*.md` 示例
4. 涉及音频失败时优先排查：
   - `ffmpeg/ffprobe` 是否可用
   - Azure TTS 接口返回
   - R2/KV 凭据是否齐全
5. 除非任务明确要求，不要改动历史 workflow 行为与 secrets 命名。

---

如果你是新接手此仓库的 Agent，建议第一步依次阅读：

1. `README.md`
2. `apps/generator/main.ts`
3. `apps/generator/utils/markdown.ts`
4. `apps/web/src/content.config.ts`
5. `packages/config/index.ts`
