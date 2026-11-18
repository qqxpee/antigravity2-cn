@echo off
setlocal EnableDelayedExpansion
title Antigravity 汉化安装工具

set "BRAND_ARG="
set "CLI_ARGS=%*"
set "HAS_BRAND=0"
if defined CLI_ARGS (
    echo(!CLI_ARGS!| findstr /i "\-\-brand-title" >nul 2>nul && set "HAS_BRAND=1"
)
if "!HAS_BRAND!"=="0" (
    echo.
    echo 请选择左上角品牌显示方式：
    echo [1] 保持英文 Antigravity（推荐）
    echo [2] 隐藏品牌名
    echo [3] 汉化为品牌名（反重力）
    set "CHOICE_VAL=1"
    set /p "CHOICE_VAL=请选择 [1/2/3] (直接按 Enter 默认为 1): "
    set "BRAND_ARG=--brand-title english"
    if "!CHOICE_VAL!"=="2" set "BRAND_ARG=--brand-title hidden"
    if "!CHOICE_VAL!"=="3" set "BRAND_ARG=--brand-title translated"
)

echo.
echo [1/2] 正在注入汉化...
node "%~dp0localization_engine.js" !BRAND_ARG! %*

if %errorlevel% neq 0 (
    echo.
    echo [×] 注入失败，请检查上方错误信息。
    pause
    exit /b 1
)

echo.
echo [2/2] 注入完成！
echo.
echo 提示：汉化已成功安装。
echo.
echo 窗口将在 5 秒后自动关闭...
timeout /t 5 >nul 2>&1 || exit /b 0
