@echo off
:: ========================================================
:: Antigravity Agent Manager HanHua Restore Tool
:: ========================================================
title Antigravity Restore Tool

echo.
echo [1/3] Detecting and closing Antigravity process...
taskkill /f /im Antigravity.exe /t >nul 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/3] Restoring Official Files...
node "%~dp0localization_engine.js" --huifu %*

echo.
echo [3/3] Restoration Complete!
echo.
echo [Note] Antigravity has been restored to its original state.
echo.
pause
