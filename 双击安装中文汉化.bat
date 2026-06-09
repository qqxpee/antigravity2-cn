@echo off
title Antigravity HanHua Tool

echo.
echo 请选择左上角品牌显示方式：
echo [1] 显示英文 Antigravity
echo [2] 不显示品牌名
echo [3] 显示中文品牌名
set "CHOICE_VAL=3"
set /p "CHOICE_VAL=请输入选项 [1/2/3] (直接按 Enter 默认为 3): "
set "BRAND_ARG=--brand-title translated"
if "%CHOICE_VAL%"=="1" set "BRAND_ARG=--brand-title english"
if "%CHOICE_VAL%"=="2" set "BRAND_ARG=--brand-title hidden"

echo.
echo [1/2] 正在注入汉化核心...
node "%~dp0localization_engine.js" %BRAND_ARG% %*

if %errorlevel% neq 0 (
    echo.
    echo [错误] 注入失败！请检查上方错误信息。
    pause
    exit /b 1
)

echo.
echo [2/2] 注入完成！
echo.
echo 提示：汉化已成功部署。
echo.
pause
