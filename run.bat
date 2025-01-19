@echo off

cd /D "%0/.."

if not exist node_modules (call npm i & if errorlevel 1 (echo Error installing modules & exit /b %errorlevel%))

node . %*
