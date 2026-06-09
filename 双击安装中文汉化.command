#!/bin/bash
cd "$(dirname "$0")"
echo "====== 正在安装 macOS 版 Antigravity 中文汉化 ======"
echo "请选择左上角品牌显示方式："
echo "[1] 显示英文 Antigravity（推荐）"
echo "[2] 不显示品牌名"
echo "[3] 显示中文品牌名"
printf "请输入 1/2/3，直接回车默认 1："
read -r BRAND_CHOICE
BRAND_ARG="--brand-title english"
if [ "$BRAND_CHOICE" = "2" ]; then
    BRAND_ARG="--brand-title hidden"
elif [ "$BRAND_CHOICE" = "3" ]; then
    BRAND_ARG="--brand-title translated"
fi

node localization_engine.js $BRAND_ARG --install-dir /Applications/Antigravity.app "$@"

if [ $? -ne 0 ]; then
    echo ""
    echo "运行失败！请检查上方错误信息。"
    read -n 1 -s
    exit 1
fi

echo ""
echo "处理完成。窗口将在 5 秒后自动关闭（或按任意键立即关闭）..."
read -t 5 -n 1 -s
