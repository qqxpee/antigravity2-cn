@echo off
setlocal EnableDelayedExpansion
title Antigravity 繁體中文安裝工具

set "BRAND_ARG="
set "SHORTCUT_ARG="
set "CLI_ARGS=%*"
set "HAS_BRAND=0"
if defined CLI_ARGS (
    echo(!CLI_ARGS!| findstr /i "\-\-brand-title" >nul 2>nul && set "HAS_BRAND=1"
)
if "!HAS_BRAND!"=="0" (
    echo.
    echo 請選擇左上角品牌顯示方式：
    echo [1] 保持英文 Antigravity（推薦）
    echo [2] 隱藏品牌名稱
    echo [3] 顯示繁體中文品牌名稱（反重力）
    set "CHOICE_VAL=1"
    set /p "CHOICE_VAL=請輸入選項 [1/2/3]（直接按 Enter 預設為 1）："
    set "BRAND_ARG=--brand-title english"
    if "!CHOICE_VAL!"=="2" set "BRAND_ARG=--brand-title hidden"
    if "!CHOICE_VAL!"=="3" set "BRAND_ARG=--brand-title translated"
    echo.
    set "SHORTCUT_VAL=N"
    set /p "SHORTCUT_VAL=是否在桌面建立自動漢化啟動圖示？更新後開啟可自動補丁 [y/N]（預設 N）："
    if /i "!SHORTCUT_VAL!"=="y" set "SHORTCUT_ARG=--create-shortcut"
)

echo.
echo [1/2] 正在注入繁體中文化...
node "%~dp0localization_engine.js" --tw !BRAND_ARG! !SHORTCUT_ARG! %*

if %errorlevel% neq 0 (
    echo.
    echo [×] 注入失敗，請檢查上方錯誤訊息，並確認已安裝 Node.js。
    pause
    exit /b 1
)

echo.
echo [2/2] 注入完成！
echo.
echo 提示：繁體中文漢化已成功套用。
echo.
echo 視窗將在 5 秒後自動關閉...
timeout /t 5 >nul 2>&1 || exit /b 0
