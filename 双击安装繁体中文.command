#!/bin/bash
cd "$(dirname "$0")"

if ! node -e 'try { process.exit(require("./node_modules/@electron/asar/package.json").version === require("./package.json").dependencies["@electron/asar"] ? 0 : 1) } catch (e) { process.exit(1) }' >/dev/null 2>&1; then
    echo "正在安裝鎖定版本的 ASAR 工具..."
    npm install --ignore-scripts --no-audit --no-fund || exit 1
fi

# 檢查管理員權限，若不是 root 則自動透過 sudo 提權
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：macOS 系統修改應用程式（/Applications）需要管理員權限"
    echo " 請在下方輸入您的電腦開機密碼（輸入時密碼不顯示，直接 Enter）："
    echo "======================================================"
    exec sudo bash "$0" "$@"
fi

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

if [ $? -ne 0 ]; then
    echo ""
    echo "執行失敗！請檢查上方錯誤訊息。"
    read -n 1 -s
    exit 1
fi

echo ""
echo "處理完成。視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）..."
read -t 5 -n 1 -s
