#!/usr/bin/env bash
set -euo pipefail

# 用法：
#   bash scripts/vps-backfill.sh                  # 从 2026-06-02 回填到最近周二
#   bash scripts/vps-backfill.sh 2026-07-07       # 从指定周二开始
#   SKIP_INSTALL=1 bash scripts/vps-backfill.sh   # 已有依赖时跳过 bun install

FROM="${1:-2026-06-02}"
ROOT="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

echo "== HN 播客回填 =="
echo "仓库: $ROOT"
echo "起始: $FROM"

for cmd in bun ffmpeg ffprobe; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌ 缺少命令: $cmd"
    exit 1
  fi
done

if [ ! -f apps/generator/.env ]; then
  echo "❌ 缺少 apps/generator/.env"
  echo "   请先把本地 .env 复制到 VPS，或手动 export 环境变量。"
  exit 1
fi

if [ ! -f apps/web/src/content/episodes/index.json ]; then
  echo "❌ 缺少 apps/web/src/content/episodes/index.json"
  exit 1
fi

AVAILABLE_KB="$(df -Pk . | awk 'NR==2 {print $4}')"
if [ -n "$AVAILABLE_KB" ] && [ "$AVAILABLE_KB" -lt 5242880 ]; then
  echo "⚠️  当前目录可用空间不足 5GB，音频生成可能中途失败。"
fi

if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  echo "== 安装依赖 =="
  bun install --frozen-lockfile
fi

# 让 bun 子进程继承 .env
set -a
# shellcheck disable=SC1091
. apps/generator/.env
set +a

LOG_DIR="apps/generator/.tmp"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/backfill-$(date +%Y%m%d-%H%M%S).log"

echo "== 日志: $LOG =="
echo "== 预览 =="
bun run backfill -- --from "$FROM" --dry-run | tee -a "$LOG"

echo ""
echo "== 开始回填 =="
echo "中断后重跑会自动跳过已完成的日期。"
bun run backfill -- --from "$FROM" 2>&1 | tee -a "$LOG"
