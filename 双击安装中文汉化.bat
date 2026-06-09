@echo off
:: ========================================================
:: Antigravity Agent Manager HanHua Tool V6.0
:: ========================================================
title Antigravity HanHua Tool

echo.
echo 请选择左上角品牌显示方式：
echo [1] 显示英文 Antigravity（推荐）
echo [2] 不显示品牌名
echo [3] 显示中文品牌�?echo Choice: 1 / 2 / 3
choice /c 123 /n /m "Choice [1/2/3]: "
set "BRAND_ARG=--brand-title english"
if "%ERRORLEVEL%"=="2" set "BRAND_ARG=--brand-title hidden"
if "%ERRORLEVEL%"=="3" set "BRAND_ARG=--brand-title translated"

echo.
echo [1/2] 正在注入汉化核心...
node "%~dp0localization_engine.js" %BRAND_ARG% %*

if %errorlevel% neq 0 (
    echo.
    echo [错误] 注入失败！请检查上方错误信息�?    pause
    exit /b 1
)

echo.
echo [2/2] 注入完成�?echo.
echo 提示：汉化已成功部署�?echo.
pause

