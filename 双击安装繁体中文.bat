@echo off
chcp 65001 >nul
title Antigravity - Install Traditional Chinese

echo.
echo 請選擇左上角品牌顯示方式：
echo [1] 顯示英文 Antigravity（推薦）
echo [2] 不顯示品牌名稱
echo [3] 顯示繁體中文品牌名
set /p BRAND_CHOICE=請輸入 1/2/3，直接 Enter 預設 1：
set "BRAND_ARG=--brand-title english"
if "%BRAND_CHOICE%"=="2" set "BRAND_ARG=--brand-title hidden"
if "%BRAND_CHOICE%"=="3" set "BRAND_ARG=--brand-title translated"

echo.
echo [1/3] 正在關閉 Antigravity 進程...
taskkill /f /im Antigravity.exe /t >nul 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/3] 正在注入繁體中文漢化...
cd /d "%~dp0"
node localization_engine.js --tw %BRAND_ARG% %*
if %errorlevel% neq 0 (
    echo ERROR: node.js failed. Make sure Node.js is installed.
    pause
    exit /b 1
)

echo.
echo [3/3] 完成！
echo 請手動重新啟動 Antigravity。
echo.
pause
