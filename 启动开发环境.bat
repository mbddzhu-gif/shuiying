@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 未安装或未加入 PATH
  echo 请先安装 LTS 版本 Node.js: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm 不可用，请检查 Node.js 安装
  pause
  exit /b 1
)

if not exist "node_modules\" (
  npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

npm run dev
