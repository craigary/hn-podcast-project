# AGENTS.md

本文件面向在本仓库工作的自动化 Agent / 编码助手，目标是让你快速、准确地完成修改并避免破坏现有流程。

## 0) 项目概览

- 项目名：`hn-podcast-project`（HN 瞎聊）
- 类型：`bun workspace` monorepo
- 语言：TypeScript（前端 Astro + 生成器 Bun 脚本）
- 核心链路：抓取 HN 热门 -> AI 生成大纲与对话 -> MiMo TTS（可回退 Azure）+ FFmpeg 合成音频 -> 上传 R2 -> 生成 episode markdown -> Astro 站点展示与 RSS 输出

## 1) 工作区结构

```txt
apps/
  web/         # Astro 6 beta 网站（内容展示 + RSS）
  generator/   # 播客生成流水线（bun 执行）
packages/
  config/      # 共享配置（站点、主持人、模型、平台链接）
```

关键目录：

- `apps/web/src/content/episodes/*.md`：节目内容源（最终发布内容）
- `apps/generator/steps/*`：生成步骤（screen / blueprint / intel / image / script）
- `apps/generator/utils/*`：TTS、HN 抓取、markdown 转换、存储等
- `packages/config/index.ts`：站点与播客公共配置

## 2) 包管理与运行命令（以仓库根目录执行）

## 安装

- `bun install`

## 开发/构建

- `bun run dev`：启动网站开发环境（等价 `bun run --cwd apps/web dev`）
- `bun run build`：构建网站（等价 `bun run --cwd apps/web build`）
- `bun run preview`：预览构建产物

## 生成播客

- `bun run gen`：生成最近一个周二（北京时间）的剧集
- `bun run gen -- --episode 114`：按期号重跑（发布日从 index.json 反查，自带覆盖）
- `bun run gen -- --date 2026-06-02`：指定发布日
- `bun run gen -- --date 2026-06-02 --force`：覆盖同一期（复用原编号）
- `bun run gen -- --date 2026-06-02 --dry-run`：只打印编号和内容窗口，不执行生成
- `bun run gen -- --local`：本地调试，产物只写 `.tmp`，不写 content / 不上传 R2

说明：

- `--date`、`--episode`、`--force`、`--local`、`--dry-run` 在 `apps/generator/main.ts` 中解析
- `--episode` 与 `--date` 互斥；`--episode` 自带 `--force` 语义
- 若未指定 `--date`，默认取最近一个已经到来的周二（北京时间）
- 期号是发布序号，由 `apps/web/src/content/episodes/index.json` 分配；同一日期重跑复用原编号
- 新期 markdown 写入 `apps/web/src/content/episodes/{number}.md`

## 辅助命令

- `bun run lint`：oxlint（`bun run lint:fix` 自动修复）
- `bun run format`：oxfmt（`bun run format:check` 只检查）
- `bun run typecheck`：generator / config 的 tsc + web 的 astro check
- `bun run check`：lint + format:check + typecheck，提交前跑这一个就够
- 补某一期：`bun run gen -- --date <YYYY-MM-DD> --force`，期号复用原编号

## 3) 生成流水线（apps/generator）

入口：`apps/generator/main.ts`

执行顺序（高层）：

1. 解析 CLI 参数，确定发布日，读取 `index.json` 分配/复用期号
2. 从 HN Algolia 抓取候选故事（发布日前 7 天 + points 过滤）
3. `screen`：用 Exa 抓 HN 详情页（text + summary + highlights），KV 缓存 7 天，不调用 LLM
4. `blueprint`：基于摘要生成整期结构（分段、选题、氛围）
   4.5 `intel`：只对 blueprint 选中的故事批量提取「冲突 + 原话」（1 次 LLM 调用）
5. `image`：生成封面提示词，用 Workers AI（FLUX.2 Dev）出图，失败回落默认封面
6. `script`：生成 intro / segment / outro 对话脚本
7. `tts`：MiMo TTS 合成语音（`TTS_PROVIDER=azure` 可回退），FFmpeg 混音、转场、封面嵌入
8. 上传 `audio.mp3`、`cover.png`、`script.json`、`blueprint.json` 到 R2
9. 转换为 Astro content markdown，写入 `apps/web/src/content/episodes/{number}.md`
10. 发布成功后写入 `index.json`（失败或本地模式不消耗编号）

产物路径（R2）：

- `episodes/{number}/blueprint.json`
- `episodes/{number}/script.json`
- `episodes/{number}/cover.png`
- `episodes/{number}/audio.mp3`

## 4) 运行环境与外部依赖

建议：

- Bun 1.3.x（与 CI 保持一致）
- 系统需可用 `ffmpeg` 与 `ffprobe`（音频步骤依赖）

主要环境变量（生成器）：

- AI：
  - `SUPERLINKED_API_KEY`（DeepSeek V4.1 Flash，主力模型）
  - `MIMO_API_KEY`（MiMo TTS 语音合成）
  - `EXA_API_KEY`（HN 页面抓取/摘要）
  - `CF_API_TOKEN` / `CF_ACCOUNT_ID`（Cloudflare Workers AI 封面生成）
- Cloudflare：
  - `CF_ACCOUNT_ID`
  - `CF_API_TOKEN`
  - `CF_KV_NAMESPACE_ID`
  - `CF_R2_ACCESS_KEY_ID`
  - `CF_R2_SECRET_ACCESS_KEY`
  - `CF_R2_BUCKET`
  - `CF_R2_PUBLIC_URL`

注意：

- 缺少 R2/KV/AI 任一关键变量都会导致对应步骤失败
- 期号已改由 `apps/web/src/content/episodes/index.json` 维护，不再使用 KV `latest_episode_number`

## 5) Web 端要点（apps/web）

- 框架：Astro `6.0.0-beta.14` + Tailwind CSS v4
- RSS：`apps/web/src/pages/rss.xml.ts`
- 内容 schema：`apps/web/src/content.config.ts`
- 部署配置：`apps/web/wrangler.jsonc`（静态资产目录 `dist`）

内容来源是 `src/content/episodes/{number}.md` frontmatter + transcript；期号与发布日映射在 `src/content/episodes/index.json`。修改 schema 时务必同步生成器 markdown 输出结构。

## 6) 代码风格与约定

- TypeScript 选项统一继承根目录 `tsconfig.base.json`，各包只写自己的差异
- 全仓库统一 oxfmt（配置见 `.oxfmtrc.json`）：`singleQuote: true`、`semi: false`、`printWidth: 100`
- `.astro` 文件目前不参与自动化格式化，改动时手写对齐现有风格
- 生成器代码以 ESM `import` 为主，保持无分号风格
- 站点 UI 文案和注释以中文（zh-CN）为主，新增内容保持一致语境
- 不要无意义重排现有 episode 内容文件；它们是发布内容的一部分

## 7) 自动化与 CI

GitHub Actions：

- `/.github/workflows/generate-episode.yml`
  - 定时任务每周二北京时间 07:30（UTC 周一 23:30）
  - 支持手动触发并传 `date/force`
  - 成功后自动提交 `apps/web/src/content/episodes/` 下新增或变更文件（含 `index.json`）

## 8) Agent 执行建议（重要）

1. 先读 `package.json` 与相关 workspace `package.json`，再执行命令，避免误用包管理器。
2. 涉及 episode 生成逻辑时，优先从 `apps/generator/main.ts` 和 `steps/*` 入手。
3. 修改 markdown schema 前，检查：
   - `apps/web/src/content.config.ts`
   - `apps/generator/utils/markdown.ts`
   - 已有 `apps/web/src/content/episodes/*.md` 示例
4. 涉及音频失败时优先排查：
   - `ffmpeg/ffprobe` 是否可用
   - MiMo / Azure TTS 接口返回
   - R2/KV 凭据是否齐全
5. 除非任务明确要求，不要改动历史 workflow 行为与 secrets 命名。

---

如果你是新接手此仓库的 Agent，建议第一步依次阅读：

1. `README.md`
2. `apps/generator/main.ts`
3. `apps/generator/utils/markdown.ts`
4. `apps/web/src/content.config.ts`
5. `packages/config/index.ts`
