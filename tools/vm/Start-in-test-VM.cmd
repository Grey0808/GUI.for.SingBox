@echo off
setlocal
echo Run only inside a disposable Windows 11 VM. No kernel will be started by this launcher.
set "VM_DATA_DIR=%~dp0data"
if not exist "%VM_DATA_DIR%\user.yaml" (
  echo Missing safe test settings. Extract the complete ZIP again into a new folder.
  exit /b 2
)
if not exist "%VM_DATA_DIR%\diagnostics" mkdir "%VM_DATA_DIR%\diagnostics"
for /f %%i in ('powershell.exe -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss-fff"') do set "VM_LOG_ID=%%i"
echo Startup log: %VM_DATA_DIR%\diagnostics\gui-%VM_LOG_ID%.log
pushd "%~dp0"
"%~dp0GUI.for.SingBox.Custom.Acceptance.exe" --data-dir "%VM_DATA_DIR%" > "%VM_DATA_DIR%\diagnostics\gui-%VM_LOG_ID%.log" 2>&1
set "VM_EXIT=%ERRORLEVEL%"
popd
exit /b %VM_EXIT%
