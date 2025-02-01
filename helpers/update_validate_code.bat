@echo off

cd /D "%0/../.."

if "%1"=="" (echo arguments: normal^|onlytest^|notest admin^|noadmin & exit /b)

if "%1"=="onlytest" (goto test)

echo Updating README.md...
node helpers/lib/update_readme.mjs
if errorlevel 1 (echo Error updating readme & exit /b %errorlevel%)
echo README.md updated
echo.

echo Updating package.json and package-lock.json...
call npx npm-check-updates -u
if errorlevel 1 (echo Error updating npm package list & exit /b %errorlevel%)
call npm i
if errorlevel 1 (echo Error updating npm packages & exit /b %errorlevel%)
echo package.json and package-lock.json updated
echo.

echo Checking code with eslint...
call npx eslint .
if errorlevel 1 (echo Error in eslint & exit /b %errorlevel%)
echo Code passes
echo.

if "%1"=="notest" (goto test-end)

:test

if "%2"=="noadmin" (goto test-noadmin)

echo Testing hash backup...
rem https://stackoverflow.com/questions/19098101/how-to-open-an-elevated-cmd-using-command-line-for-windows/32216421#32216421
powershell -Command "Start-Process helpers/lib/admin_test_runner.bat -Verb RunAs -Wait"
if errorlevel 1 (echo Error creating hash backup test process & exit /b %errorlevel%)
echo If the spawned window closed automatically, hash backup test was a success.
echo Otherwise, hash backup test failed.
echo.
goto test-end

:test-noadmin

call ./helpers/lib/admin_test_runner.bat

:test-end
