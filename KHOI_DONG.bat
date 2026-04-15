@echo off
title Sơ Đồ Gia Phả - Khởi động
color 0A

echo.
echo ================================================
echo     SO DO GIA PHA - KHOI DONG HE THONG
echo ================================================
echo.

:: Kiểm tra Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua cai Node.js. Tai tai: https://nodejs.org
    pause & exit
)

:: Khởi động server local (chạy nền)
echo [1/2] Dang khoi dong server tai http://localhost:8080 ...
start /b cmd /c "npx serve@14 pb_public -p 8080 -s 2>nul"
timeout /t 3 /nobreak >nul

:: Kiểm tra cloudflared
if not exist "cloudflared.exe" (
    echo [2/2] Dang tai Cloudflare Tunnel...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe' -UseBasicParsing"
)

:: Khởi động Cloudflare Tunnel
echo [2/2] Dang tao link cong khai...
echo.
echo ================================================
echo  Sau khi thay dong "Your quick Tunnel has been
echo  created!", copy link https://...trycloudflare.com
echo  va gui cho thanh vien gia dinh.
echo ================================================
echo.
cloudflared.exe tunnel --url http://localhost:8080

pause
