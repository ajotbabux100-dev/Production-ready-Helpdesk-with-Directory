@echo off
title Helpdesk System
cd /d "%~dp0"

echo ============================================================
echo  Helpdesk Ticketing System — Production Start
echo ============================================================

:: ── Step 1: Apply any pending Django migrations ──
echo [1/4] Running migrations...
venv\Scripts\python.exe backend\manage.py migrate --run-syncdb 2>&1
if errorlevel 1 (echo   WARNING: Migration step failed & pause)

:: ── Step 2: Collect static files ──
echo [2/4] Collecting static files...
venv\Scripts\python.exe backend\manage.py collectstatic --noinput -v 0

:: ── Step 3: Build frontend if .next is missing ──
echo [3/4] Checking frontend build...
if not exist "frontend\.next" (
    echo   Building frontend — this takes ~30 seconds...
    node frontend\node_modules\next\dist\bin\next build --cwd frontend
)

:: ── Step 4: Start with PM2 ──
echo [4/4] Starting services with PM2...
pm2 start ecosystem.config.js

echo.
echo ============================================================
echo  Services running:
echo    API  → http://localhost:8000
echo    Web  → http://localhost:3000
echo.
echo  pm2 status     — check process status
echo  pm2 logs       — live logs
echo  pm2 stop all   — stop everything
echo ============================================================
pm2 status
