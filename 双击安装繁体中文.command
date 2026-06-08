#!/bin/bash
cd "$(dirname "$0")"
echo "====== 正在安裝 macOS 版 Antigravity 繁體中文漢化 ======"
echo "請選擇左上角品牌顯示方式："
echo "[1] 顯示英文 Antigravity（推薦）"
echo "[2] 不顯示品牌名稱"
echo "[3] 顯示繁體中文品牌名"
printf "請輸入 1/2/3，直接 Enter 預設 1："
read -r BRAND_CHOICE
BRAND_ARG="--brand-title english"
if [ "$BRAND_CHOICE" = "2" ]; then
    BRAND_ARG="--brand-title hidden"
elif [ "$BRAND_CHOICE" = "3" ]; then
    BRAND_ARG="--brand-title translated"
fi
node localization_engine.js --tw $BRAND_ARG --install-dir /Applications/Antigravity.app "$@"
echo ""
echo "處理完成。按下任意鍵退出..."
read -n 1 -s
