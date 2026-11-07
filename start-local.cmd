@echo off
cd /d "%~dp0"
call npm.cmd exec --yes --package=node@24 -- node node_modules/@angular/cli/bin/ng.js serve %*
