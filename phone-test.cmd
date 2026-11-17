@echo off
rem DEVELOPMENT ONLY: double-click to test the waiter app on a phone (guide: docs\phone-test.md).
rem Starts the local server in its own window (if it isn't running), sets up the test cafe,
rem shows the phone pairing code, then this window becomes the pretend kitchen.
title CAFE KITCHEN (pretend) - phone test
cd /d "%~dp0server"

node -e "fetch('http://127.0.0.1:8787/menu').then(()=>process.exit(0),()=>process.exit(1))" >nul 2>nul
if %errorlevel%==0 (
  echo The server is already running.
) else (
  node scripts\dev-access-vars.mjs >nul || goto fail
  echo Starting the server in a NEW window. Keep that window open while you test.
  start "CAFE SERVER - keep this window open" cmd /k npx.cmd wrangler dev --ip 0.0.0.0
)

node scripts\dev-phone-test.mjs || goto fail

echo.
echo ==================================================================
echo   This window is now the KITCHEN. Type and press Enter:
echo     a 1  = accept item 1     r 1 = item 1 is ready
echo     u 1  = undo (within 10 s)   l = list   q = quit
echo ==================================================================
node scripts\dev-kitchen.mjs
echo.
pause
exit /b

:fail
echo.
echo Something went wrong. Select the text above, press Enter to copy it, and send it to Claude.
pause
