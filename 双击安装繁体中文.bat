@echo off
title Antigravity Traditional Chinese Installer

node "%~dp0localization_engine.js" --tw --interactive %*

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Localization failed! Please check the messages above and ensure Node.js is installed.
    pause
    exit /b 1
)

timeout /t 5 2>nul || exit /b 0
