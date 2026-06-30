@echo off
title Helpdesk — Stop
cd /d "%~dp0"
echo Stopping all Helpdesk services...
pm2 stop all
pm2 delete all
echo Done.
