@echo off
rem Antigravity launcher: re-inject Chinese localization if an official auto-update wiped it, then start the app.
rem Traditional Chinese: add --tw after --launch below. Brand title: add --brand-title hidden / translated.
node "%~dp0scripts\ensure_localized.js" --fix --launch %*
if %errorlevel% neq 0 (
    echo.
    echo [!] Localization check did not finish cleanly. See messages above.
    pause
    exit /b %errorlevel%
)
timeout /t 3 >nul 2>&1 || exit /b 0
