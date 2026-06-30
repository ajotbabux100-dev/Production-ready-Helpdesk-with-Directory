@echo off
title Helpdesk — Deploy Update
cd /d "%~dp0"

echo ============================================================
echo  Helpdesk — Deploying Update
echo ============================================================

:: Stop running processes
echo [1/5] Stopping current services...
pm2 stop all 2>nul

:: Apply migrations
echo [2/5] Applying migrations...
venv\Scripts\python.exe backend\manage.py migrate --noinput

:: Collect static files
echo [3/5] Collecting static files...
venv\Scripts\python.exe backend\manage.py collectstatic --noinput -v 0

:: Rebuild frontend
echo [4/5] Building frontend...
if exist "frontend\.next" rmdir /s /q "frontend\.next"
node frontend\node_modules\next\dist\bin\next build --cwd frontend

:: Restart PM2
echo [5/5] Restarting services...
pm2 restart ecosystem.config.js --update-env

echo.
echo ============================================================
echo  Deploy complete.
echo ============================================================
pm2 status
