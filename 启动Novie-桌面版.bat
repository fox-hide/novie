@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron 尚未安装，正在执行 npm install...
  call npm install
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo 启动失败：没有找到 Electron。
  echo 请确认已安装 Node.js，然后在项目目录运行：npm install
  echo.
  pause
  exit /b 1
)

start "" "node_modules\electron\dist\electron.exe" .
