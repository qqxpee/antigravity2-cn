@echo off
chcp 950 >nul
title Antigravity - Install Traditional Chinese

echo.
echo [1/3] Closing Antigravity process...
taskkill /f /im Antigravity.exe /t >nul 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/3] Injecting localization...
cd /d "%~dp0"
node localization_engine.js --tw %*
if %errorlevel% neq 0 (
    echo ERROR: node.js failed. Make sure Node.js is installed.
    pause
    exit /b 1
)

echo.
echo [3/3] Done!
echo Please restart Antigravity manually.
echo.
pause
