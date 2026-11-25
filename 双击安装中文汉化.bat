@echo off
title Antigravity Localization Installer

node "%~dp0localization_engine.js" --interactive %*

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Localization failed! Please check the messages above and ensure Node.js is installed.
    pause
    exit /b 1
)

timeout /t 5 2>nul || exit /b 0
