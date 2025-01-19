@echo off

cd "%0/../.."

echo Updating README.md...
node helpers/update_readme.mjs
if errorlevel 1 (echo Error updating readme & exit /b %errorlevel%)
echo README.md updated
echo.

echo Updating package.json and package-lock.json...
call npm update --save
if errorlevel 1 (echo Error updating npm packages & exit /b %errorlevel%)
echo package.json and package-lock.json updated
echo.

echo Checking code with eslint...
call npx eslint .
if errorlevel 1 (echo Error in eslint & exit /b %errorlevel%)
echo Code passes
echo.

echo Testing hash backup...
echo unimplemented
exit /b 0
npm test symlink
if errorlevel 1 (echo Error in symlink test & pause & exit /b %errorlevel%)
echo.
