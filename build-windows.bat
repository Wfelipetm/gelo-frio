@echo off
chcp 65001 >nul
echo === FrioGest: gerando instalador ===
where node >nul 2>nul || (echo Instale o Node.js 22 em https://nodejs.org e rode de novo. & pause & exit /b 1)
call npm install || goto erro
call npm test || goto erro
call npm run dist || goto erro
echo.
echo Pronto! O instalador esta na pasta "dist".
explorer dist
pause
exit /b 0
:erro
echo Ocorreu um erro. Veja as mensagens acima.
pause
