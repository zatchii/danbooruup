@echo off
del /f danbooruup.xpi > nul
del /f chrome\danbooruup.jar > nul
cd chrome
zip -9r danbooruup.jar .
cd ..
rem components\*.xpt components\*.js
zip -9r danbooruup.xpi chrome.manifest install.rdf chrome\danbooruup.jar defaults

