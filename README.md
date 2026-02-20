# HN 瞎聊 (Hacker News Podcast Generator)

A fully automated podcast generator that curates top stories from Hacker News, generates scripts with AI personalities ("小雅" and "老冯"), synthesizes speech with emotional depth, mixes audio with background music, and publishes episodes to a static website.

## Features

- **Automated Curation**: Fetches top stories from Hacker News based on score and date.
- **AI-Powered Scripting**: Uses Cerebras (Llama 3.1 70B via Groq/Cerebras) and Mistral Large for generating blueprints and conversational scripts.
- **Dynamic Hosts**: Two distinct AI personalities with unique voices and styles.
- **High-Quality Audio**: Uses Microsoft Azure TTS (reverse-engineered endpoint) for natural-sounding speech.
- **Professional Production**: Automatic audio mixing with background music, transitions, and sound effects using FFmpeg.
- **Cover Art Generation**: Creates episode-specific cover art using Pollinations AI.
- **Static Site Hosting**: Built with Astro and deployed to Cloudflare Pages.

## Project Structure

This is a monorepo managed by pnpm:

- `apps/generator`: The core Node.js application that handles the entire podcast generation pipeline.
- `apps/web`: The Astro-based frontend for showcasing episodes.
- `packages/config`: Shared configuration for the project.

## Prerequisites

- **Node.js** (v20 or higher)
- **pnpm**
- **FFmpeg**: Must be installed and available in your system's PATH.
- **Cloudflare Account**: R2 storage and KV store.

## Environment Variables

Create a `.env` file in the root or `apps/generator` directory with the following variables:

```env
# AI Providers
CEREBRAS_API_KEY=your_cerebras_api_key
MISTRAL_API_KEY=your_mistral_api_key
POLLINATIONS_API_KEY=your_pollinations_api_key

# Cloudflare (R2 & KV)
CF_ACCOUNT_ID=your_cloudflare_account_id
CF_API_TOKEN=your_cloudflare_api_token
CF_R2_ACCESS_KEY_ID=your_r2_access_key_id
CF_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
CF_R2_BUCKET=your_r2_bucket_name
CF_KV_NAMESPACE_ID=your_kv_namespace_id
CF_R2_PUBLIC_URL=https://your-r2-public-url.com
```

## Installation

```bash
pnpm install
```

## Usage

### Generate an Episode

To generate a new podcast episode (fetches latest HN stories):

```bash
pnpm gen
```

To regenerate a specific episode (e.g., episode 1):

```bash
pnpm gen --episode 1 --force
```

### Run the Website

To start the local development server for the website:

```bash
pnpm dev
```

The site will be available at `http://localhost:4321`.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Frameworks**: Astro (Frontend)
- **AI Models**: Cerebras, Mistral, Pollinations
- **Audio Processing**: FFmpeg, Microsoft Azure TTS
- **Storage**: Cloudflare R2, Cloudflare KV
