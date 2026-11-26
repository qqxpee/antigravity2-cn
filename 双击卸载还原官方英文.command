#!/bin/bash
# 以 root 运行时，先把 PATH 换成系统目录再执行任何命令：传入的 PATH 可能把用户可写目录排在前面，
# 让同名程序以 root 身份运行。传入的 PATH 只用来查找 node
if [ "$EUID" -eq 0 ]; then INCOMING_PATH="$PATH"; export PATH="/usr/bin:/bin:/usr/sbin:/sbin"; fi
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"

# 补充 macOS 常见环境路径 (兼容 Intel 与 Apple Silicon M 系列芯片及 nvm/fnm/volta/asdf/mise 等版本管理器)
# 只在用户阶段查找 node；提权后的 root 阶段只沿用找到的 node 所在目录
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
    # 按版本号升序排序后再按版本门槛前置到 PATH（兼容 macOS BSD sort，避免旧版 nvm 抢占新版路径）
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

# 检查管理员权限，若不是 root 则自动通过 sudo 提权并保留环境变量
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：macOS 系统修改应用程序（/Applications）需要管理员权限"
    echo " 请在下方输入您的电脑开机密码（输入时密码不显示，直接回车）："
    echo "======================================================"
    # 提权后的 PATH 只放系统目录与 node 所在目录（系统目录优先），不把用户的完整 PATH 交给 root，
    # 以免可写目录里的同名程序以 root 身份运行
    USER_NODE="$(command -v node || true)"
    ROOT_PATH="/usr/bin:/bin:/usr/sbin:/sbin"
    if [ -n "$USER_NODE" ]; then ROOT_PATH="$ROOT_PATH:$(dirname "$USER_NODE")"; fi
    exec /usr/bin/sudo /usr/bin/env "PATH=$ROOT_PATH" "HTTP_PROXY=$HTTP_PROXY" "HTTPS_PROXY=$HTTPS_PROXY" "ALL_PROXY=$ALL_PROXY" "http_proxy=$http_proxy" "https_proxy=$https_proxy" "all_proxy=$all_proxy" "SUDO_USER=$USER" /bin/bash "$SCRIPT_PATH" "$@"
fi
# root 阶段的 PATH 一律重建：系统目录排在最前，只另加 node 所在目录。经由上面提权进入时 PATH 已是这个形式；
# 直接以 root 运行时，传入的 PATH 顺序不可信，只用来查找 node
ROOT_NODE="$(export PATH="${INCOMING_PATH:-$PATH}"; command -v node || true)"
if [ -z "$ROOT_NODE" ]; then
    for cand in /usr/local/bin/node /opt/homebrew/bin/node; do
        if [ -x "$cand" ]; then ROOT_NODE="$cand"; break; fi
    done
fi
export PATH="/usr/bin:/bin:/usr/sbin:/sbin${ROOT_NODE:+:$(dirname "$ROOT_NODE")}"

# 检查 Node.js 环境
if ! command -v node &> /dev/null; then
    echo ""
    echo "======================================================"
    echo " [错误] 未检测到 Node.js 环境，无法执行还原。"
    echo " 请前往 https://nodejs.org 下载安装 Node.js (LTS 版本) 后重试。"
    echo "======================================================"
    echo ""
    echo "按任意键退出..."
    read -n 1 -s
    exit 1
fi

HAS_CUSTOM_INSTALL_DIR=false
for arg in "$@"; do
    if [[ "$arg" == --install-dir* ]]; then
        HAS_CUSTOM_INSTALL_DIR=true
        break
    fi
done

EXTRA_ARGS=(--huifu)
if [ "$HAS_CUSTOM_INSTALL_DIR" = false ] && [ -d "/Applications/Antigravity.app" ]; then
    EXTRA_ARGS+=(--install-dir "/Applications/Antigravity.app")
fi

echo "====== 正在还原 macOS 版 Antigravity 官方英文 ======"
node localization_engine.js "${EXTRA_ARGS[@]}" "$@"

if [ $? -ne 0 ]; then
    echo ""
    echo "运行失败！请检查上方错误信息。"
    read -n 1 -s
    exit 1
fi

echo ""
echo "处理完成。窗口将在 5 秒后自动关闭（或按任意键立即关闭）..."
read -t 5 -n 1 -s || true
exit 0
