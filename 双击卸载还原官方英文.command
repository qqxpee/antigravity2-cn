#!/bin/bash
cd "$(dirname "$0")"
echo "====== 正在还原 macOS 版 Antigravity 官方英文 ======"
node localization_engine.js --huifu --install-dir /Applications/Antigravity.app
echo ""
echo "处理完成。按下任意键退出..."
read -n 1 -s
