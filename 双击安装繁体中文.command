#!/bin/bash
# 以 root 執行時，先把 PATH 換成系統目錄再執行任何指令：傳入的 PATH 可能把使用者可寫目錄排在前面，
# 讓同名程式以 root 身分執行。傳入的 PATH 只用來找 node
if [ "$EUID" -eq 0 ]; then INCOMING_PATH="$PATH"; export PATH="/usr/bin:/bin:/usr/sbin:/sbin"; fi
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"

# 補充 macOS 常見環境路徑 (相容 Intel 與 Apple Silicon M 系列晶片及 nvm/fnm/volta/asdf/mise 等版本管理器)
# 只在使用者階段搜尋 node；提權後的 root 階段只沿用找到的 node 所在目錄
if [ "$EUID" -ne 0 ]; then
    REAL_USER="${SUDO_USER:-$USER}"
    REAL_HOME=""
    if [ -n "$REAL_USER" ] && command -v dscl >/dev/null 2>&1; then
        REAL_HOME=$(dscl . -read "/Users/$REAL_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')
    fi
    if [ -z "$REAL_HOME" ] || [ ! -d "$REAL_HOME" ]; then
        if [ -n "$REAL_USER" ] && [ -d "/Users/$REAL_USER" ]; then
            REAL_HOME="/Users/$REAL_USER"
        else
            REAL_HOME="$HOME"
        fi
    fi
    export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/opt/local/bin:$PATH"
    for p in "$REAL_HOME/.volta/bin" "$REAL_HOME/.asdf/shims" "$REAL_HOME/.local/share/mise/shims" "$REAL_HOME/.local/bin" "$REAL_HOME/.fnm/current/bin" "$REAL_HOME/.local/share/fnm/aliases/default/bin" "$REAL_HOME/Library/Application Support/fnm/aliases/default/bin"; do
        [ -d "$p" ] && export PATH="$p:$PATH"
    done
    # 依版本號升序排序後再依版本門檻前置至 PATH（相容 macOS BSD sort，避免舊版 nvm 搶佔新版路徑）
    CURR_NODE_MAJOR=0
    if command -v node >/dev/null 2>&1; then
        CURR_NODE_MAJOR=$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')
        CURR_NODE_MAJOR=${CURR_NODE_MAJOR:-0}
    fi
    while IFS=$'\t' read -r cand_major p; do
        if [ -d "$p" ] && [ "${cand_major:-0}" -ge "$CURR_NODE_MAJOR" ]; then
            export PATH="$p:$PATH"
            CURR_NODE_MAJOR=$cand_major
        fi
    done < <(
        for d in "$REAL_HOME"/.nvm/versions/node/*/bin /opt/homebrew/opt/node@*/bin /usr/local/opt/node@*/bin; do
            [ -d "$d" ] && printf '%s\n' "$d"
        done | awk -F/ '{
            seg = $(NF-1);
            if (match(seg, /[0-9]+(\.[0-9]+)*/)) {
                split(substr(seg, RSTART, RLENGTH), a, ".");
                printf "%06d%06d%06d\t%d\t%s\n", a[1]+0, a[2]+0, a[3]+0, a[1]+0, $0;
            }
        }' | LC_ALL=C sort | cut -f2-
    )
fi

# 檢查管理員權限，若不是 root 則自動透過 sudo 提權並保留環境變數
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：macOS 系統修改應用程式（/Applications）需要管理員權限"
    echo " 請在下方輸入您的電腦開機密碼（輸入時密碼不顯示，直接 Enter）："
    echo "======================================================"
    # 提權後的 PATH 只放系統目錄與 node 所在目錄（系統目錄優先），不把使用者整條 PATH 交給 root，
    # 以免可寫目錄裡的同名程式以 root 身分執行
    USER_NODE="$(command -v node || true)"
    ROOT_PATH="/usr/bin:/bin:/usr/sbin:/sbin"
    if [ -n "$USER_NODE" ]; then ROOT_PATH="$ROOT_PATH:$(dirname "$USER_NODE")"; fi
    exec /usr/bin/sudo /usr/bin/env "PATH=$ROOT_PATH" "HTTP_PROXY=$HTTP_PROXY" "HTTPS_PROXY=$HTTPS_PROXY" "ALL_PROXY=$ALL_PROXY" "http_proxy=$http_proxy" "https_proxy=$https_proxy" "all_proxy=$all_proxy" "SUDO_USER=$USER" /bin/bash "$SCRIPT_PATH" "$@"
fi
# root 階段的 PATH 一律重建：系統目錄排最前，只另加 node 所在目錄。經由上面提權進來時 PATH 已是這個形式；
# 直接以 root 執行時，傳入的 PATH 順序不可信，只拿來找 node
ROOT_NODE="$(export PATH="${INCOMING_PATH:-$PATH}"; command -v node || true)"
if [ -z "$ROOT_NODE" ]; then
    for cand in /usr/local/bin/node /opt/homebrew/bin/node; do
        if [ -x "$cand" ]; then ROOT_NODE="$cand"; break; fi
    done
fi
export PATH="/usr/bin:/bin:/usr/sbin:/sbin${ROOT_NODE:+:$(dirname "$ROOT_NODE")}"

# 檢查 Node.js 環境
if ! command -v node &> /dev/null; then
    echo ""
    echo "======================================================"
    echo " [錯誤] 未偵測到 Node.js 環境，無法執行中文化。"
    echo " 請前往 https://nodejs.org 下載安裝 Node.js (LTS 版本) 後重試。"
    echo "======================================================"
    echo ""
    echo "按任意鍵退出..."
    read -n 1 -s
    exit 1
fi

# 檢查是否已透過命令列傳入 --brand-title
HAS_BRAND_ARG=false
HAS_CUSTOM_INSTALL_DIR=false
for arg in "$@"; do
    if [[ "$arg" == --brand-title* ]]; then
        HAS_BRAND_ARG=true
    elif [[ "$arg" == --install-dir* ]]; then
        HAS_CUSTOM_INSTALL_DIR=true
    fi
done

EXTRA_ARGS=(--tw)
if [ "$HAS_BRAND_ARG" = false ]; then
    BRAND_MODE="english"
    if [ -t 0 ]; then
        echo "====== 正在安裝 macOS 版 Antigravity 繁體中文漢化 ======"
        echo "請選擇左上角品牌顯示方式："
        echo "[1] 顯示英文 Antigravity（推薦）"
        echo "[2] 不顯示品牌名稱"
        echo "[3] 顯示繁體中文品牌名"
        printf "請輸入 1/2/3，直接 Enter 預設 1："
        read -r BRAND_CHOICE
        if [ "$BRAND_CHOICE" = "2" ]; then
            BRAND_MODE="hidden"
        elif [ "$BRAND_CHOICE" = "3" ]; then
            BRAND_MODE="translated"
        fi
    fi
    EXTRA_ARGS+=(--brand-title "$BRAND_MODE")
fi

if [ "$HAS_CUSTOM_INSTALL_DIR" = false ] && [ -d "/Applications/Antigravity.app" ]; then
    EXTRA_ARGS+=(--install-dir "/Applications/Antigravity.app")
fi

node localization_engine.js "${EXTRA_ARGS[@]}" "$@"

if [ $? -ne 0 ]; then
    echo ""
    echo "執行失敗！請檢查上方錯誤訊息。"
    read -n 1 -s
    exit 1
fi

echo ""
echo "處理完成。視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）..."
read -t 5 -n 1 -s || true
exit 0
