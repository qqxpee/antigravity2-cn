#!/bin/bash
cd "$(dirname "$0")"
echo "====== 正在安裝 macOS 版 Antigravity 繁體中文漢化 ======"
node localization_engine.js --tw --install-dir /Applications/Antigravity.app
echo ""
echo "處理完成。按下任意鍵退出..."
read -n 1 -s
