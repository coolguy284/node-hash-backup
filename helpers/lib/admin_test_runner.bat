@echo off

cd /D "%0/../../.."

echo Testing hash backup...
call npm test symlink
if errorlevel 1 (echo Error in hash backup test & pause & exit /b %errorlevel%)
echo Hash backup test success
