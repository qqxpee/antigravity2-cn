@echo off
chcp 950 >nul
title Antigravity - Restore English

echo.
echo [1/3] Closing Antigravity process...
taskkill /f /im Antigravity.exe /t >nul 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/3] Restoring original files...
cd /d "%~dp0"
node localization_engine.js --huifu %*
if %errorlevel% neq 0 (
    echo ERROR: node.js failed. Make sure Node.js is installed.
    pause
    exit /b 1
)

echo.
echo [3/3] Restored!
echo Antigravity has been restored to English.
echo.
pause
