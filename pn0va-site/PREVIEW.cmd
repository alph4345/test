@echo off
rem Preview the site on this computer, the way the web host will show it:
rem clean addresses, redirects and the Drops map included.
rem
rem Double-click this file and pick a build, or drag a site folder onto it.
rem Nothing to install: the server is tools\preview.ps1, run by the
rem PowerShell that comes with Windows. Close the window to stop it.
if not exist "%~dp0tools\preview.ps1" (
  echo.
  echo   tools\preview.ps1 is missing. If you opened PREVIEW.cmd from inside
  echo   the zip, unzip the whole zip first: right-click it, Extract All.
  echo.
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\preview.ps1" %*
rem any failure, including PowerShell's own negative exit codes: keep the
rem window open so the message can be read
if not "%errorlevel%"=="0" pause
