@echo off

rem https://stackoverflow.com/questions/5034076/what-does-dp0-mean-and-how-does-it-work/5034119#5034119
set "original_cd=%cd%"
set "code_dir=%~dp0"

cd /D %code_dir%
echo %code_dir%
echo %cd%

if not exist node_modules (goto do_install) else (goto run)

:do_install
call npm i --omit dev
if errorlevel 1 (goto do_install_no_optional) else (goto run)

:do_install_no_optional
call npm i --omit dev --omit optional
if errorlevel 1 (echo Error installing modules & exit /b %errorlevel%) else (echo Error installing optional modules, but regular modules worked)

:run
cd /D "%original_cd%"
node test.mjs
node test.mjs "%code_dir%" %*
exit
node " %code_dir% " %*
