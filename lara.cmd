@echo off
setlocal
set "SCRIPT_DIR=%~dp0"

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -3 "%SCRIPT_DIR%run_lara.py" %*
  if errorlevel 1 goto setup_failed
  exit /b 0
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python "%SCRIPT_DIR%run_lara.py" %*
  if errorlevel 1 goto setup_failed
  exit /b 0
)

echo Python 3.9 or newer was not found.
echo Install Python from https://www.python.org/downloads/
pause
exit /b 1

:setup_failed
echo.
echo Lara could not start. Review the error above.
pause
exit /b 1
