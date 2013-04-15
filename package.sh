#!/bin/sh

rm danbooruup.xpi chrome/danbooruup.jar
(cd chrome; zip -9r danbooruup.jar . -x '*~' '*.swp')

zip -9r danbooruup.xpi chrome.manifest install.rdf chrome/danbooruup.jar defaults -x '*~' '*.swp'
zip -9r danbooruup.xpi components/danbooruUpHelper.js components/danbooruTagHistoryService.js components/danbooruac.xpt -x '*.svn*'
