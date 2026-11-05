# HN 瞎聊 (Hacker News 播客生成器)

这是一款全自动化的播客生成工具，旨在探索 AI 在内容创作领域的可能性。它能够根据 Hacker News 的热门话题自动生成内容，由两位个性鲜明的 AI 主持人——“小雅”和“老冯”——进行深度对谈。

项目利用情感丰富的语音合成技术制作音频，自动配上背景音乐和转场音效，最终生成一期完整的播客节目，并发布到静态网站上。

> **注意**：本项目是一个个人实验项目，不建议直接部署使用。

## 核心功能

- **自动化选题**：根据分数和日期，自动抓取 Hacker News 上的热门讨论。
- **AI 驱动脚本创作**：利用 gpt-oss-120b、Mistral Large 等模型，生成播客大纲和生动自然的对话脚本。
- **个性化主持人**：
  - **小雅**：Web 开发/前端专家，性格直率，效率至上，拥抱 AI。
  - **老冯**：底层架构/系统老兵，老油条，技术深度极高，喜欢冷嘲热讽。
- **高品质语音**：使用 Microsoft Azure TTS（逆向工程接口）合成自然流畅、带有情感的语音。
- **专业后期制作**：使用 FFmpeg 自动进行音频混音，添加背景音乐、转场音效和环境音。
- **封面自动生成**：使用 Pollinations AI 为每一期节目生成专属封面。
- **静态网站发布**：基于 Astro 构建的前端页面，支持在线收听。

## 技术栈

- **开发语言**: TypeScript
- **运行环境**: Bun
- **前端框架**: Astro
- **AI 模型**: DeepSeek, Exa, Pollinations
- **音频处理**: FFmpeg, Microsoft Azure TTS
- **云服务**: Cloudflare R2 (对象存储), Cloudflare KV (键值存储)

## 常用命令

- 安装依赖：`bun install`
- 开发站点：`bun run dev`
- 构建站点：`bun run build`
- 生成播客：`bun run gen`
- 指定发布日生成/覆盖：`bun run gen -- --date 2026-06-02 --force`
- 预览生成计划：`bun run gen -- --date 2026-06-02 --dry-run`
- 回填缺失的周二：`bun run backfill`
- 预览回填编号：`bun run backfill -- --dry-run`
- VPS 一键回填：`bun run backfill:vps`

## 在 VPS 上回填

VPS 需要 Bun、`ffmpeg`、`ffprobe`，以及 `apps/generator/.env`（不要提交到 git）。

```bash
git clone <repo> hn-podcast-project
cd hn-podcast-project

# 从本地把 .env 复制到 VPS
scp apps/generator/.env user@vps:/path/to/hn-podcast-project/apps/generator/.env

# 建议放在 tmux 里跑，避免 SSH 断开
tmux new -s hn-backfill 'bash scripts/vps-backfill.sh'

# 或者直接跑
bun run backfill:vps
```

脚本会先打印待回填日期和编号，然后按顺序生成。默认每期失败重试 3 次、间隔 60 秒；重试仍失败会停下，重跑会跳过已完成日期并从失败那天继续。日志在 `apps/generator/.tmp/backfill-*.log`。

可选参数：

```bash
bash scripts/vps-backfill.sh 2026-07-07      # 从指定周二开始
SKIP_INSTALL=1 bash scripts/vps-backfill.sh  # 跳过 bun install
REPO_DIR=/path/to/repo bash vps-backfill.sh  # 脚本放在仓库外时指定仓库路径

BACKFILL_RETRIES=5 BACKFILL_RETRY_DELAY=120 bash scripts/vps-backfill.sh
AUTO_PUSH=1 bash scripts/vps-backfill.sh     # 每期成功后自动 commit + push
```

> `.env` 不在仓库里（已被 gitignore）。VPS 上必须单独创建 `apps/generator/.env`，不要把真实密钥提交到 git。
