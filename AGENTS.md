# AGENTS.md

## Build & Run

- Package manager: **Bun** (monorepo with `bun workspaces`)
- `bun run dev` — start Astro dev server (apps/web)
- `bun run build` — build the Astro site
- `bun run gen` — run the podcast generator pipeline (`bun main.ts` in apps/generator)
- Generator accepts `--episode <n>` and `--date <YYYY-MM-DD>` flags

## Architecture

Monorepo with three workspaces:

- **apps/web** — Astro 6 (beta) site with Tailwind CSS v4, serves podcast episodes and RSS feed. Content lives in `src/content/episodes/*.md`.
- **apps/generator** — Bun script pipeline: fetches HN stories → AI blueprint → AI script → Azure TTS audio → uploads to Cloudflare R2 → writes episode markdown. Uses Vercel AI SDK with Mistral/Cerebras models.
- **packages/config** (`@hn/config`) — Shared podcast configuration (hosts, AI models, site settings, platform links).

## Storage

- **Cloudflare R2** for audio/images; **Cloudflare KV** (via unstorage) for episode counter.
- Generator env vars in `apps/generator/.env` (Azure TTS, R2 credentials, AI keys).

## Code Style

- TypeScript throughout; Bun runtime for generator, Astro for web.
- Imports: no semicolons in generator code, use `import` (ESM). Web uses `.astro` components with frontmatter.
- Icons via `unplugin-icons` (`~icons/lucide/...`, `~icons/simple-icons/...`).
- Tailwind: custom semantic tokens (`text-tx1`–`text-tx4`, `bg-sf-card`, `border-bd`, `text-ac`).
- Chinese (zh-CN) UI text and comments throughout; preserve this convention.
