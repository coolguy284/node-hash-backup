@echo off

cd "%0/.."

if not exist node_modules npm i
if not errorlevel 0 echo Error installing modules & exit /b %errorlevel%

node . %*
