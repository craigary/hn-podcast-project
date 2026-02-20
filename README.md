# HN 瞎聊 (Hacker News 播客生成器)

这是一款全自动化的播客生成工具，能够根据 Hacker News 的热门话题自动生成内容。它拥有两位个性鲜明的 AI 主持人——“小雅”和“老冯”，能够生成具有深度的对话脚本，并利用情感丰富的语音合成技术制作音频，最终配上背景音乐和转场音效，生成一期完整的播客节目，并发布到静态网站上。

## 核心功能

- **自动化选题**：根据分数和日期，自动抓取 Hacker News 上的热门讨论。
- **AI 驱动脚本创作**：利用 Cerebras (gpt-oss-120b) 和 Mistral Large 模型，生成播客大纲和生动自然的对话脚本。
- **个性化主持人**：
  - **小雅**：Web 开发/前端专家，性格直率，效率至上，拥抱 AI。
  - **老冯**：底层架构/系统老兵，老油条，技术深度极高，喜欢冷嘲热讽。
- **高品质语音**：使用 Microsoft Azure TTS（逆向工程接口）合成自然流畅、带有情感的语音。
- **专业后期制作**：使用 FFmpeg 自动进行音频混音，添加背景音乐、转场音效和环境音。
- **封面自动生成**：使用 Pollinations AI 为每一期节目生成专属封面。
- **静态网站发布**：基于 Astro 构建的前端页面，部署在 Cloudflare Pages 上，支持在线收听。

## 项目结构

这是一个基于 pnpm 管理的 Monorepo：

- `apps/generator`: 核心 Node.js 应用，负责整个播客生成的流水线（抓取、脚本、音频、后期）。
- `apps/web`: 基于 Astro 的前端网站，用于展示和播放播客。
- `packages/config`: 项目共享的配置模块。

## 前置要求

- **Node.js** (v20 或更高版本)
- **pnpm**
- **FFmpeg**: 必须安装并配置在系统 PATH 中（用于音频处理）。
- **Cloudflare 账号**: 需要使用 R2 存储（存放音频、图片）和 KV 存储（记录状态）。

## 环境变量

在项目根目录或 `apps/generator` 目录下创建 `.env` 文件，并填入以下内容：

```env
# AI 模型服务商
CEREBRAS_API_KEY=your_cerebras_api_key
MISTRAL_API_KEY=your_mistral_api_key
POLLINATIONS_API_KEY=your_pollinations_api_key

# Cloudflare (R2 & KV 配置)
CF_ACCOUNT_ID=your_cloudflare_account_id
CF_API_TOKEN=your_cloudflare_api_token
CF_R2_ACCESS_KEY_ID=your_r2_access_key_id
CF_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
CF_R2_BUCKET=your_r2_bucket_name
CF_KV_NAMESPACE_ID=your_kv_namespace_id
CF_R2_PUBLIC_URL=https://your-r2-public-url.com
```

## 安装

```bash
pnpm install
```

## 使用指南

### 生成播客

生成新的一期播客（自动抓取最新热门内容）：

```bash
pnpm gen
```

重新生成特定的一期（例如第 1 期）：

```bash
pnpm gen --episode 1 --force
```

### 启动网站

启动本地开发服务器预览网站：

```bash
pnpm dev
```

网站将在 `http://localhost:4321` 访问。

## 技术栈

- **开发语言**: TypeScript
- **运行环境**: Node.js
- **前端框架**: Astro
- **AI 模型**: Cerebras (gpt-oss-120b), Mistral, Pollinations
- **音频处理**: FFmpeg, Microsoft Azure TTS
- **云服务**: Cloudflare R2 (对象存储), Cloudflare KV (键值存储)
