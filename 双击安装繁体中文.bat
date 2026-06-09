@echo off
title Antigravity - Install Traditional Chinese

echo.
echo 請選擇左上角品牌顯示方式：
echo [1] 顯示英文 Antigravity
echo [2] 不顯示品牌名稱
echo [3] 顯示繁體中文品牌名
set "CHOICE_VAL=3"
set /p "CHOICE_VAL=請輸入選項 [1/2/3] (直接按 Enter 默認為 3): "
set "BRAND_ARG=--brand-title translated"
if "%CHOICE_VAL%"=="1" set "BRAND_ARG=--brand-title english"
if "%CHOICE_VAL%"=="2" set "BRAND_ARG=--brand-title hidden"

echo.
echo [1/2] 正在注入繁體中文漢化...
cd /d "%~dp0"
node localization_engine.js --tw %BRAND_ARG% %*

if %errorlevel% neq 0 (
    echo.
    echo 錯誤：漢化注入失敗。請確認是否已安裝 Node.js。
    pause
    exit /b 1
)

echo.
echo [2/2] 完成！
echo.
echo 提示：繁體中文漢化已成功部署。
echo.
pause
