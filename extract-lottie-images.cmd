@echo off
setlocal
REM Windows CLI wrapper for extract_lottie_images.py
REM Usage: extract-lottie-images.cmd giftbox.json
REM        extract-lottie-images.cmd path\to\anim.json -o my-assets

set "SCRIPT_DIR=%~dp0"

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -3 "%SCRIPT_DIR%extract_lottie_images.py" %*
  exit /b %ERRORLEVEL%
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python "%SCRIPT_DIR%extract_lottie_images.py" %*
  exit /b %ERRORLEVEL%
)

where python3 >nul 2>&1
if %ERRORLEVEL%==0 (
  python3 "%SCRIPT_DIR%extract_lottie_images.py" %*
  exit /b %ERRORLEVEL%
)

echo Python was not found. Install Python 3 from https://www.python.org/downloads/
echo and make sure "Add python.exe to PATH" is checked.
exit /b 1
