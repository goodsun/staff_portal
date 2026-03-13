#!/bin/bash
# HQ labo_portal を更新するスクリプト
# 使い方: sh scripts/update_hq.sh

set -e

LABO_DIR="${LABO_DIR:-/Users/teddy/projects/labo_portal}"
SERVICE="com.bonsoleil.labo-hq"

echo "🔄 labo_portal (HQ) を更新中..."

cd "$LABO_DIR"

echo "📦 git pull..."
git pull

echo "🔨 npm run build..."
npm run build

echo "🔁 launchd 再起動..."
launchctl stop "$SERVICE" && sleep 2 && launchctl start "$SERVICE"

echo "✅ HQ labo_portal 更新完了！"
echo "   → https://local.bon-soleil.com/hq/"
