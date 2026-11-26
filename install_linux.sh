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
HAS_BRAND_ARG=false
for arg in "$@"; do
    if [ "$arg" = "--tw" ]; then
        USE_TW=true
    elif [[ "$arg" == --brand-title* ]]; then
        HAS_BRAND_ARG=true
    fi
done

if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "======================================================"
    if [ "$USE_TW" = true ]; then
        echo " [錯誤] 未偵測到 Node.js 環境，無法執行中文化。"
        echo " 請前往 https://nodejs.org 或透過套件管理器安裝 Node.js 後重試。"
    else
        echo " [错误] 未检测到 Node.js 环境，无法执行汉化。"
        echo " 请前往 https://nodejs.org 或通过包管理器安装 Node.js 后重试。"
    fi
    echo "======================================================"
    echo ""
    exit 1
fi

EXTRA_ARGS=()
if [ "$HAS_BRAND_ARG" = false ]; then
    BRAND_MODE="english"
    if [ -t 0 ]; then
        if [ "$USE_TW" = true ]; then
            echo "====== 正在安裝 Linux 版 Antigravity 繁體中文漢化 ======"
            echo "請選擇左上角品牌顯示方式："
            echo "[1] 顯示英文 Antigravity（推薦）"
            echo "[2] 不顯示品牌名稱"
            echo "[3] 顯示繁體中文品牌名"
            printf "請輸入 1/2/3，直接 Enter 預設 1："
        else
            echo "====== 正在安装 Linux 版 Antigravity 中文汉化 ======"
            echo "请选择左上角品牌显示方式："
            echo "[1] 显示英文 Antigravity（推荐）"
            echo "[2] 不显示品牌名"
            echo "[3] 显示中文品牌名"
            printf "请输入 1/2/3，直接回车默认 1："
        fi
        read -r BRAND_CHOICE
        if [ "$BRAND_CHOICE" = "2" ]; then
            BRAND_MODE="hidden"
        elif [ "$BRAND_CHOICE" = "3" ]; then
            BRAND_MODE="translated"
        fi
    fi
    EXTRA_ARGS+=(--brand-title "$BRAND_MODE")
fi

node localization_engine.js "${EXTRA_ARGS[@]}" "$@"
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
    echo "處理完成！重新啟動 Antigravity 即可生效。"
else
    echo "处理完成！重新启动 Antigravity 即可生效。"
fi
exit 0
