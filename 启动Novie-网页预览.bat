@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 启动失败：没有检测到 Node.js。
  pause
  exit /b 1
)

echo 正在启动 Novie 网页预览...
echo 地址：http://127.0.0.1:5178
echo 关闭此窗口或按 Ctrl+C 停止服务。
echo.
start "" /b cmd /c "timeout /t 2 >nul & explorer http://127.0.0.1:5178"
node tools\serve.js
pause
