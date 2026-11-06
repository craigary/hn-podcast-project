# HN 瞎聊 (Hacker News 播客生成器)

这是一款全自动化的播客生成工具，旨在探索 AI 在内容创作领域的可能性。它能够根据 Hacker News 的热门话题自动生成内容，由两位个性鲜明的 AI 主持人——“小雅”和“老冯”——进行深度对谈。

项目利用情感丰富的语音合成技术制作音频，自动配上背景音乐和转场音效，最终生成一期完整的播客节目，并发布到静态网站上。

> **注意**：本项目是一个个人实验项目，不建议直接部署使用。

## 核心功能

- **自动化选题**：根据分数和日期，自动抓取 Hacker News 上的热门讨论。
- **AI 驱动脚本创作**：用 DeepSeek V4.1 Flash 生成播客大纲和生动自然的对话脚本。
- **个性化主持人**：
  - **小雅**：Web 开发/前端专家，性格直率，效率至上，拥抱 AI。
  - **老冯**：底层架构/系统老兵，老油条，技术深度极高，喜欢冷嘲热讽。
- **高品质语音**：使用 Microsoft Azure TTS（逆向工程接口）合成自然流畅、带有情感的语音。
- **专业后期制作**：使用 FFmpeg 自动进行音频混音，添加背景音乐、转场音效和环境音。
- **封面自动生成**：使用 Cloudflare Workers AI（FLUX.2 Dev）为每一期节目生成专属封面，失败时回退到默认封面。
- **静态网站发布**：基于 Astro 构建的前端页面，支持在线收听。

## 技术栈

- **开发语言**: TypeScript
- **运行环境**: Bun
- **前端框架**: Astro
- **AI 模型**: DeepSeek, Exa, Cloudflare Workers AI
- **音频处理**: FFmpeg, Microsoft Azure TTS
- **云服务**: Cloudflare R2 (对象存储), Cloudflare KV (键值存储)

## 常用命令

- 安装依赖：`bun install`
- 开发站点：`bun run dev`
- 构建站点：`bun run build`
- 部署站点：`bun run deploy`
- 生成播客：`bun run gen`
- 重跑某一期：`bun run gen -- --episode 114`
- 指定发布日生成/覆盖：`bun run gen -- --date 2026-06-02 --force`
- 预览生成计划：`bun run gen -- --date 2026-06-02 --dry-run`
- 本地调试（只写 .tmp，不上传）：`bun run gen -- --local --force`
- 检查代码（lint + 格式 + 类型）：`bun run check`

## 补生成某一期

线上某一期失败时（比如某个 API 临时抽风），直接给期号重跑，编号和发布日都从 `index.json` 反查，不会多占编号：

```bash
bun run gen -- --episode 114
```

也可以用发布日指定：

```bash
bun run gen -- --date 2026-11-03 --force
```

`--episode` 自带覆盖语义，不用再加 `--force`；`--date` 则需要显式加 `--force` 才会重跑已存在的日期。`--episode` 和 `--date` 只能给一个。

覆盖时会重写 `apps/web/src/content/episodes/114.md`，并重新上传 R2 上的音频和封面；文件地址里的 `?v=` 版本号会跟着变，听众的播放器不会拿到旧缓存。

只想看期号和内容窗口，不真的生成：

```bash
bun run gen -- --episode 114 --dry-run
```

只想在本地听效果，不碰线上任何东西：

```bash
bun run gen -- --episode 114 --local
```

运行前需要两份东西：`apps/generator/.env`（Bun 会按工作目录自动加载，不要提交到 git），以及系统里可用的 `ffmpeg` / `ffprobe`。
