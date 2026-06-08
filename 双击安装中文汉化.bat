@echo off
chcp 65001 >nul
:: ========================================================
:: Antigravity Agent Manager HanHua Tool V6.0
:: ========================================================
title Antigravity HanHua Tool

echo.
echo 请选择左上角品牌显示方式：
echo [1] 显示英文 Antigravity（推荐）
echo [2] 不显示品牌名
echo [3] 显示中文品牌名
echo Choice: 1 / 2 / 3
choice /c 123 /n /m "Choice [1/2/3]: "
set "BRAND_ARG=--brand-title english"
if "%ERRORLEVEL%"=="2" set "BRAND_ARG=--brand-title hidden"
if "%ERRORLEVEL%"=="3" set "BRAND_ARG=--brand-title translated"

echo.
echo [1/3] 正在检测并关闭 Antigravity 进程...
taskkill /f /im Antigravity.exe /t >nul 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/3] 正在注入汉化核心...
node "%~dp0localization_engine.js" %BRAND_ARG% %*

echo.
echo [3/3] 注入完成！
echo.
echo [提示] 请手动重新启动 Antigravity。
echo.
pause
