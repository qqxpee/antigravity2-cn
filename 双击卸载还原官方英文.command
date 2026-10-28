#!/bin/bash
cd "$(dirname "$0")"

# 补充 macOS 常见环境路径 (兼容 Intel 与 Apple Silicon M 系列芯片及 nvm/fnm/volta/asdf/mise 等版本管理器)
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER" 2>/dev/null || echo "$HOME")
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/opt/local/bin:$PATH"
for p in "$REAL_HOME/.volta/bin" "$REAL_HOME/.asdf/shims" "$REAL_HOME/.local/share/mise/shims" "$REAL_HOME/.local/bin" "$REAL_HOME/.fnm/current/bin" "$REAL_HOME/.local/share/fnm/aliases/default/bin" "$REAL_HOME/Library/Application Support/fnm/aliases/default/bin"; do
    [ -d "$p" ] && export PATH="$p:$PATH"
done
for p in "$REAL_HOME"/.nvm/versions/node/*/bin /opt/homebrew/opt/node@*/bin /usr/local/opt/node@*/bin; do
    [ -d "$p" ] && export PATH="$p:$PATH"
done

# 检查管理员权限，若不是 root 则自动通过 sudo 提权并保留环境变量
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：macOS 系统修改应用程序（/Applications）需要管理员权限"
    echo " 请在下方输入您的电脑开机密码（输入时密码不显示，直接回车）："
    echo "======================================================"
    exec sudo env "PATH=$PATH" "HTTP_PROXY=$HTTP_PROXY" "HTTPS_PROXY=$HTTPS_PROXY" "ALL_PROXY=$ALL_PROXY" "http_proxy=$http_proxy" "https_proxy=$https_proxy" "all_proxy=$all_proxy" "SUDO_USER=$USER" bash "$0" "$@"
fi

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
