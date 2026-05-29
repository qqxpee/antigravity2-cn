@echo off
:: ========================================================
:: Antigravity Agent Manager HanHua Tool V6.0
:: ========================================================
title Antigravity HanHua Tool

echo.
echo [1/3] Detecting and closing Antigravity process...
taskkill /f /im Antigravity.exe /t >nul 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/3] Injecting Localization Core...
node "%~dp0localization_engine.js" %*

echo.
echo [3/3] Injection Complete!
echo.
echo [Note] Please manually restart Antigravity.
echo.
pause
