<div align="center">

# Antigravity 2.0 智能编程中文语言包 & 汉化引擎

**零依赖纯 Node.js 原生注入 · 支持简繁双语 · 一键安装与无损还原**

[![Version](https://img.shields.io/badge/Antigravity-v2.35.1%2B-blue?style=flat-square)](https://antigravity.google/download)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)](#-快速开始)
[![Tests](https://github.com/qqxpee/antigravity2-cn/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/qqxpee/antigravity2-cn/actions/workflows/tests.yml)
[![Stars](https://img.shields.io/github/stars/qqxpee/antigravity2-cn?style=flat-square&color=yellow)](https://github.com/qqxpee/antigravity2-cn/stargazers)
[![License](https://img.shields.io/github/license/qqxpee/antigravity2-cn?style=flat-square&color=green)](LICENSE)

👉 **[繁體中文版說明文件 (Traditional Chinese README)](README_TW.md)**

[✨ 核心特性](#-核心特性) · [📸 效果预览](#-效果预览) · [🚀 快速开始](#-快速开始) · [❓ 常见问题](#-常见问题) · [🔌 进阶功能](#-进阶功能) · [🛠️ 原理与开发](#️-原理与开发)

</div>

---

## ✨ 核心特性

- **开箱即用，零依赖**：纯 Node.js 原生解析并校验重包 `app.asar`，无需安装 Python，三端（Windows / macOS / Linux）均内置一键脚本。
- **全量深度汉化**：覆盖主界面、悬浮提示 (Tooltip)、Sidecar 伴生面板（含 Swarm 与 `plugin://` 子框架）、顶部菜单、托盘与原生右键菜单、主进程原生弹窗（退出确认、WSL/SSH 提示、设备与 Passkey 选择等）、更新弹窗、加载动画、设置面板及登录引导页。
- **严格内容隔离**：通过 `WeakMap` / `WeakSet` 与 Shadow DOM 穿透技术，在汉化 UI 的同时严格隔离代码编辑器、终端输出与对话正文，绝不误伤代码。
- **安全可逆**：首次运行自动备份原始 `app.asar.bak`，候选包通过语法与完整性校验后才原子替换；随时支持一键无损还原官方英文。

---

## 📸 效果预览

> [!NOTE]
> 以下截图录制于项目立项初期的 **Antigravity v2.0.10**（2026-05），仅作汉化效果与风格参考；当前已持续跟进适配至 **v2.35.1+**，最新版 UI 与新增面板（如 Swarm、Sidecar、MCP 市场、原生弹窗等）均已覆盖。

<details>
<summary><b>👉 点击展开早期版本汉化效果截图（Antigravity v2.0.10 时期）</b></summary>

### 1. 欢迎页与登录新手引导
![欢迎页与登录新手引导](./showimg/showlogin.png)

### 2. 主编辑器界面与菜单
![主编辑器界面与菜单](./showimg/showmain.png)

### 3. 详细参数设置面板
![详细参数设置面板](./showimg/showmenu.png)

</details>

---

## 🚀 快速开始

### 第 1 步：获取汉化包（二选一）

- **方法 A：直接下载 ZIP 压缩包（推荐新手 📦）**
  1. 点击本页右上角绿色的 **`Code`** 按钮，选择 **`Download ZIP`**。
  2. 将压缩包**解压到本地任意目录**（如 `Downloads` 文件夹）。

- **方法 B：通过 Git 克隆（方便后续更新 💻）**
  ```bash
  # 国内加速镜像（如镜像失效请更换其他可用代理）：
  git clone https://mirror.ghproxy.com/https://github.com/qqxpee/antigravity2-cn.git

  # 或使用官方地址（需本地代理）：
  git clone https://github.com/qqxpee/antigravity2-cn.git
  ```

### 第 2 步：一键安装汉化

1. **完全退出** Antigravity 软件（确保后台进程已关闭）。
2. 进入解压或克隆后的 `antigravity2-cn` 目录，按系统运行对应脚本：

| 系统平台 | 一键安装（简体中文） | 一键卸载（还原英文） |
| :--- | :--- | :--- |
| **Windows** | 双击 **`双击安装中文汉化.bat`** | 双击 **`双击卸载还原官方英文.bat`** |
| **macOS** | 双击 **`双击安装中文汉化.command`** | 双击 **`双击卸载还原官方英文.command`** |
| **Linux** | 终端运行 **`./install_linux.sh`**（繁体加 `--tw`） | 终端运行 **`./uninstall_linux.sh`** |

> [!TIP]
> Linux 若目标安装目录（如 `/opt/antigravity`）需要管理员权限，脚本会自动通过 `sudo` 提权并正确清理当前用户的 Electron 缓存。

3. 按提示选择左上角品牌显示方式：
   - **显示英文 `Antigravity`（默认推荐）**：保留官方品牌名，避免左上角过长。
   - **不显示品牌名**：隐藏左上角品牌文字。
   - **显示中文品牌名**：显示“反重力智能编程”。
4. 运行完成后重新启动 Antigravity 即可生效。

> [!TIP]
> **Windows 防自动更新失效小技巧**：Antigravity 官方在退出时可能会后台静默升级并覆盖回英文。建议直接将 **`启动Antigravity(自动检查汉化).bat`** 发送到桌面作为启动快捷方式，每次启动前会自动检测并在需要时补回汉化。

<details>
<summary><b>⚙️ 命令行参数参考（<code>--brand-title</code>）</b></summary>

如果您通过命令行直接运行 `localization_engine.js`，可使用 `--brand-title` 控制左上角品牌名：

```bash
# 默认推荐：左上角显示 Antigravity
node localization_engine.js --brand-title english

# 隐藏左上角品牌名
node localization_engine.js --brand-title hidden

# 显示中文品牌名
node localization_engine.js --brand-title translated
```

</details>

---

## ❓ 常见问题

<details>
<summary><b>1. 提示“解包失败”或缺少 Node.js / npm 环境怎么办？</b></summary>

- **原因**：汉化引擎依赖 Node.js 进行 ASAR 包解析。由于 Antigravity 本身基于 Node.js / Electron，多数情况下脚本会自动复用环境。
- **解决**：如果极少数情况仍报错，请安装 [Node.js](https://nodejs.org/)（LTS 版本即可），安装后重新运行脚本。

</details>

<details>
<summary><b>2. Windows 提示“权限不足”，或 macOS 提示“无法打开” / <code>EPERM</code> 怎么办？</b></summary>

- **Windows**：右键点击 `双击安装中文汉化.bat`，选择 **“以管理员身份运行”**。
- **macOS 提示无权限 / 已损坏**：
  - 终端执行 `chmod +x *.command` 授予执行权限；若被系统拦截，请在 **“系统设置 -> 隐私与安全性”** 中点击 **“仍要打开”**。
  - 本引擎已内置自动 Ad-hoc 重签名机制，正常完成注入后不会提示应用损坏。
- **macOS 输入密码后仍提示“目标目录不可写”或 `EPERM`**：
  - 从 macOS 13 (Ventura) 起，修改 `/Applications` 中的应用受系统“App 管理”（TCC）拦截，仅靠 `sudo` 无法绕过。
  - 请前往 **“系统设置 -> 隐私与安全性 -> App 管理”**，为您当前执行脚本的终端应用（如“终端 / Terminal”、iTerm2、Warp、VS Code 内置终端等，列表没有可点 `+` 手动添加）开启权限；若仍失败，再为同一终端开启 **“完全磁盘访问权限”**。
  - 授权后按 `Cmd+Q` **完全退出该终端**并重新打开，再执行脚本（该权限按“发起操作的终端应用”单独授权，更换终端需重新授权）。

</details>

<details>
<summary><b>3. 为什么 Windows 更新后变回英文？macOS 如何升级新版？</b></summary>

- **平台机制差异**：
  - **Windows**：Antigravity 内置 `electron-updater`（NSIS，`autoDownload = true`、`autoInstallOnAppQuit = true`），退出软件时会在后台静默覆盖 `resources/app.asar`，导致下次打开变回英文。
  - **macOS**：汉化后应用包采用本地 ad-hoc 重签名（`codesign --sign -`），designated requirement 仅匹配当前包的 `cdhash`。内置自动更新（`Squirrel.framework`）在校验阶段会拦截覆盖（`did not pass validation`），因此不会“更新后变回英文”，而是停留在旧版。
- **Windows 恢复方式**：
  - **手动恢复**：完全退出软件，重新双击 **`双击安装中文汉化.bat`**。
  - **自动自检启动**：使用 **`启动Antigravity(自动检查汉化).bat`**（底层调用 `node scripts/ensure_localized.js --fix --launch`）启动软件。它会在启动前检查 `app.asar` 是否含汉化标记；若已被官方更新覆盖且客户端未运行，会自动沿用上次的 `--tw` / `--brand-title` 偏好以 `--no-kill` 重新注入后再拉起客户端（若修复失败会中止启动并报错，不会直接启动英文版；如需显式切换简繁可附加 `--sc` 或 `--tw`）。
- **macOS 升级方式**：前往 [antigravity.google/download](https://antigravity.google/download) 下载最新版 DMG 覆盖安装 `Antigravity.app`，再重新双击 **`双击安装中文汉化.command`** 即可。

</details>

<details>
<summary><b>4. 在简体中文 Windows 上运行繁体版脚本提示乱码怎么办？</b></summary>

- 为兼容繁体中文 Windows（代码页 `CP950`），`双击安装繁体中文.bat` 按 Big5 编码保存；在简体中文 Windows（默认 `CP936`）直接双击时终端提示会显示乱码。
- 可在 CMD 中先切换代码页再运行：`chcp 950 && 双击安装繁体中文.bat`，或直接执行 `node localization_engine.js --tw --brand-title english`。

</details>

---

## 🔌 进阶功能

### 1. 网络透明代理自动注入（Windows 免 TUN 方案）

如果您处于网络受限环境（如连通 Google AI / Gemini 接口受阻），且不希望开启系统全局虚拟网卡 / TUN 模式，本项目支持在安装汉化时**自动联动注入 Windows 免 TUN 强制代理工具**（基于开源项目 **[yuaotian/antigravity-proxy](https://github.com/yuaotian/antigravity-proxy)**）。

1. 前往 **[yuaotian/antigravity-proxy](https://github.com/yuaotian/antigravity-proxy)** 获取最新编译好的代理文件（通常包含 `.dll` 劫持模块如 `version.dll` 等，以及配置模板 `config.json`，具体文件名以该版本发布说明为准）。
2. 在当前汉化项目根目录新建 `proxy_config` 文件夹（已加入 `.gitignore` 本地排除，不会被 Git 提交）。
3. 将所需的全部代理文件（对应的 `.dll` 文件，以及按本地代理端口如 `127.0.0.1:7890` / `18080` 配置好的 `config.json`）放入 `proxy_config/` 目录。
   > [!WARNING]
   > 引擎会将 `proxy_config/` 下的**所有文件**同步复制到软件安装目录，请勿在此文件夹中放置无关文件或压缩包。
4. 正常双击运行 **`双击安装中文汉化.bat`**：引擎会自动检测 `proxy_config/`，一步完成“汉化 + 代理注入/覆盖更新”，软件更新后也无需每次手动拷贝 DLL。
5. **零侵入设计**：未创建 `proxy_config/` 时保持 100% 纯净汉化；运行 **`双击卸载还原官方英文.bat`** 时仅还原官方英文，会保留已注入的代理文件（如需移除可手动删除）。

---

### 2. 自定义与补充翻译

发现漏译或想微调某个词条时，既可以直接让 Antigravity 里的 AI 帮你改，也可以手动编辑 JSON 词典：

#### 方式 A：让 AI 助手自动补充/修改（推荐 🤖）

> [!IMPORTANT]
> **如何让 AI 定位您的词库目录？**
> 1. **最省心**：在 Antigravity 中点击 **“打开文件夹 (Open Folder)”** 直接打开本 `antigravity2-cn` 目录，在此工作区中直接发图或提要求，AI 会自动定位并修改词典。
> 2. **免开项目**：若正在别的项目工作区中对话，请在提示词中写出汉化包实际路径，例如：
>    `“我的汉化包目录在 C:\Users\您的用户名\Downloads\antigravity2-cn，请帮我把截图里漏译的内容补全到词典。”`

- **截图补全**：直接粘贴未汉化界面的截图并发送：
  > **“帮我把这张截图里所有未汉化的英文选项和面板内容补全到中文词典中。”**
- **精确修改**：直接发送文字描述：
  > **“帮我把漏译的英文 'Allow agent to view and edit files outside of the current workspace automatically' 汉化为 '允许智能体自动查看并编辑当前工作区之外的文件'。”**

#### 方式 B：手动编辑词典 JSON（极客向 📝）

直接编辑 `dicts/`（简体）或 `dicts_tw/`（繁体）下的 6 个分模块 JSON 文件（注意末尾英文逗号）：
- **`common.json`**：公共基础词汇、侧边栏概览、登录页、常用按钮等
- **`menu_nav.json`**：系统及菜单栏翻译
- **`page_main.json`**：主对话区、编辑器、工作区及核心交互文案
- **`page_agents.json`**：智能体 / 子代理 / Swarm 协作相关文案
- **`page_settings.json`**：详细设置面板与权限二级菜单对照
- **`page_mcp_knowledge.json`**：官方 MCP 服务器及知识库说明翻译

```json
"Original English Text": "您的中文翻译"
```

> 修改完成后，**完全退出 Antigravity** 并重新运行 **`双击安装中文汉化.bat` / `.command`**（或 `./install_linux.sh`）即可生效。

---

## 🛠️ 原理与开发

### 1. 汉化原理与项目结构

本引擎采用 **零依赖原生 ASAR 校验重包模式**，专为 **Antigravity 2.0+** 的 Electron 架构设计：

<details>
<summary><b>🔍 点击展开注入原理与源码目录详情</b></summary>

#### 注入与安全机制
1. **自动释放锁与多级缓存清理**：运行前自动探测并安全关闭 Antigravity 进程；注入完成后递归清理 `Antigravity` / `Antigravity IDE` 顶层及 `Partitions/hub-browser-*` 等分区下的 `Cache`、`Code Cache`、`GPUCache` 字节码缓存。
2. **安全备份与事务保护**：首次运行创建原始 `app.asar.bak` 备份；构建候选包并逐文件通过 `node --check` 与完整性校验后才原子替换，支持随时无损还原。
3. **精准注入点**：
   - `preload.js`：采用 `WeakMap` / `WeakSet` 与 Shadow DOM 穿透，启动微任务合批的 `MutationObserver` 引擎，在严格隔离代码编辑器、终端与消息正文的前提下动态汉化 UI，并拦截原生右键菜单 IPC。
   - `utils.js`：在主窗口加载并校验目标来源后，向 Sidecar 伴生面板子框架（`http(s)://` 与 `plugin://`）注入动态汉化运行时。
   - `menu.js` / `tray.js` / `updater.js` / `loadingOverlay.js`：汉化系统级标题栏菜单、托盘菜单、更新检查弹窗以及启动加载页（`正在加载 Antigravity…`）。
   - 主进程原生弹窗与内置页（`main.js`、`ipcHandlers.js`、`remoteManager.js`、`sshPrompts.js`、`deviceChooser.js`、`webauthn.js`、`webviewPopupSecurity.js`、`provisionSplash.js`）：覆盖退出确认框、macOS Dock 菜单、WSL 初始化与报错、SSH 安全密钥提示、设备/Passkey 选择与弹窗连接安全信息。

#### 项目文件结构
- **`双击安装中文汉化.bat` / `.command` / `install_linux.sh`**：三端一键简体安装入口（Windows/macOS 另有繁体版，Linux 可加 `--tw`）。
- **`双击卸载还原官方英文.bat` / `.command` / `uninstall_linux.sh`**：三端一键还原原版入口。
- **`启动Antigravity(自动检查汉化).bat`**：Windows 自检启动器，自动检测并修复被官方更新覆盖的汉化。
- **`localization_engine.js`**：核心调度引擎（环境探测、进程释放、词典编译、缓存清理、macOS `Info.plist` 校验与重签名）。
- **`src/`**：模块化核心源码
  - `preload_runtime.js`：前端 DOM 动态隔离与表驱动正则引擎（含内容隔离、Shadow DOM 穿透与原生右键菜单钩子）。
  - `main_patches.js`：主进程补丁集（`preload.js`、`utils.js`、`menu.js`、`tray.js`、`loadingOverlay.js`、`updater.js` 及原生弹窗模块）。
  - `asar_patcher.js`：零依赖纯 Node.js 二进制 ASAR 读取、补丁写入与完整性校验器。
- **`dicts/` / `dicts_tw/`**：简繁双语对照词典（各 6 个 JSON 模块）。
- **`scripts/`**：工程工具集（`compare_dicts.js` 简繁对齐与禁词校验、`dev_tool.js` 版本升级文案/MCP 扫描、`ensure_localized.js` 自检启动）。
- **`tests/`**：基于 Node 原生 test runner 与 `jsdom` 的回归测试套件。

</details>

### 2. 版本升级差异扫描与 MCP 自动对齐（欢迎社区共建）

Antigravity 2.x 的前端 SPA 与“添加 MCP 服务器 (Add MCP Server)”目录由客户端内置 `language_server` 与云端 RPC 动态提供。版本升级时无需逐页截图，可使用内置 [`scripts/dev_tool.js`](scripts/dev_tool.js) 自动提取差异：

1. 启动最新版 Antigravity 客户端（确保后台 `language_server` 进程正在运行）。
2. 在项目根目录扫描差异并更新翻译：
   ```bash
   # 1. 扫描全量界面、悬浮提示与模板字面量差异 -> scratch/untranslated_ui_diff.json
   node scripts/dev_tool.js scan-ui

   # 2. 对比官方 MCP 目录变更 -> scratch/mcp_catalog_diff.json
   node scripts/dev_tool.js dump-mcp
   ```
3. 将 `scratch/` 增量文件交由 AI 助手或手动补充至 `dicts/` 与 `dicts_tw/`（必要时更新 `src/preload_runtime.js` 动态规则）。
4. 运行校验并更新基准，清理 `scratch/` 后即可测试并提交 PR：
   ```bash
   node scripts/compare_dicts.js
   node scripts/dev_tool.js scan-ui --update-baseline
   node scripts/dev_tool.js dump-mcp --update-baseline
   ```

> [!TIP]
> 更多诊断命令（如 `port`、`search`、`slice`）可直接查看 [`scripts/dev_tool.js`](scripts/dev_tool.js) 顶部注释。

### 3. 回归测试

测试依赖固定为 jsdom `30.1.3`，需 Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`（建议使用 Node.js 24.15.0+）。在项目根目录运行：

```sh
npm ci
npm test
node --check localization_engine.js
node --check src/preload_runtime.js
node --check src/main_patches.js
node --check src/asar_patcher.js
node --check scripts/ensure_localized.js
node --check scripts/compare_dicts.js
node --check scripts/dev_tool.js
node scripts/compare_dicts.js
```

测试从当前源码生成翻译脚本，在 `jsdom` 和临时目录中验证内容隔离、表单值、Shadow DOM、Swarm/Sidecar 网关、主进程弹窗 ASAR 校验、多级缓存清理及模板动态规则，不启动或修改本机 Antigravity；GitHub Actions 会在 Windows 和 Linux 上自动执行上述检查。

---

## 📈 Star 增长趋势

[![Star History Chart](https://api.star-history.com/svg?repos=qqxpee/antigravity2-cn&type=Date)](https://star-history.com/#qqxpee/antigravity2-cn&Date)

---

## 🤝 致谢

- 感谢所有参与测试与反馈的贡献者！
- 特别鸣谢 **[yuaotian/antigravity-proxy](https://github.com/yuaotian/antigravity-proxy)** 提供优秀的 Windows 免 TUN 强制代理注入方案。
- 特别鸣谢 **[yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese)** 开放的词典成果（MIT 协议），为本项目 v2.26.0+ 新增特性词条整合提供了重要基础。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
