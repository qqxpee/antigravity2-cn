#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# 补充 Linux 常见 Node.js 与版本管理器路径 (兼容 sudo 与 nvm/fnm/volta/asdf/mise)
REAL_USER="${SUDO_USER:-${USER:-}}"
REAL_HOME=""
if [ -n "$REAL_USER" ] && command -v getent >/dev/null 2>&1; then
    REAL_HOME="$(getent passwd "$REAL_USER" 2>/dev/null | cut -d: -f6)"
fi
if [ -z "$REAL_HOME" ] || [ ! -d "$REAL_HOME" ]; then
    if [ -n "$REAL_USER" ] && [ -d "/home/$REAL_USER" ]; then
        REAL_HOME="/home/$REAL_USER"
    else
        REAL_HOME="${HOME:-}"
    fi
fi

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
for p in \
    "$REAL_HOME/.volta/bin" \
    "$REAL_HOME/.asdf/shims" \
    "$REAL_HOME/.local/share/mise/shims" \
    "$REAL_HOME/.local/bin" \
    "$REAL_HOME/.fnm/current/bin" \
    "$REAL_HOME/.local/share/fnm/aliases/default/bin"
do
    [ -d "$p" ] && export PATH="$p:$PATH"
done
for p in "$REAL_HOME"/.nvm/versions/node/*/bin; do
    [ -d "$p" ] && export PATH="$p:$PATH"
done

USE_TW=false
for arg in "$@"; do
    if [ "$arg" = "--tw" ]; then
        USE_TW=true
        break
    fi
done

if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "======================================================"
    if [ "$USE_TW" = true ]; then
        echo " [錯誤] 未偵測到 Node.js 環境，無法執行還原。"
        echo " 請前往 https://nodejs.org 或透過套件管理器安裝 Node.js 後重試。"
    else
        echo " [错误] 未检测到 Node.js 环境，无法执行还原。"
        echo " 请前往 https://nodejs.org 或通过包管理器安装 Node.js 后重试。"
    fi
    echo "======================================================"
    echo ""
    exit 1
fi

if [ "$USE_TW" = true ]; then
    echo "====== 正在還原 Linux 版 Antigravity 官方英文 ======"
else
    echo "====== 正在还原 Linux 版 Antigravity 官方英文 ======"
fi

node localization_engine.js --huifu "$@"
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
    echo ""
    if [ "$USE_TW" = true ]; then
        echo "執行失敗！請檢查上方錯誤訊息。"
    else
        echo "运行失败！请检查上方错误信息。"
    fi
    exit "$EXIT_CODE"
fi

echo ""
if [ "$USE_TW" = true ]; then
    echo "還原完成！重新啟動 Antigravity 即可恢復官方英文。"
else
    echo "还原完成！重新启动 Antigravity 即可恢复官方英文。"
fi
exit 0
