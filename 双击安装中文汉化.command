#!/bin/bash
cd "$(dirname "$0")"
echo "====== 正在安装 macOS 版 Antigravity 中文汉化 ======"
node localization_engine.js --install-dir /Applications/Antigravity.app
echo ""
echo "处理完成。按下任意键退出..."
read -n 1 -s
