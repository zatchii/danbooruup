#!/bin/sh

rm danbooruup.xpi chrome/danbooruup.jar
(cd chrome; zip -9r danbooruup.jar . -x .cvsignore '*.svn*')

zip -9r danbooruup.xpi chrome.manifest install.rdf chrome/danbooruup.jar defaults -x '*.svn*'
zip -9r danbooruup.xpi components/danbooruUpHelper.js components/danbooruTagHistoryService.js components/danbooruac.xpt -x '*.svn*'
