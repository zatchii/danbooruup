#!/bin/sh
set -e

./makeUserJS.py -dce
./makeUserJS.py -do userjs/operaext/includes/danbooruUpUserJS.js

#echo 'Packaging Chrome...'
#rm -f danbooruup.crx
#zip -Xj danbooruup.crx userjs/chromeext/{background.html,background.js,inject.js,manifest.json,icon*.png}
rm -rf userjs/chromebuild
mkdir userjs/chromebuild
cp userjs/chromeext/{background.js,inject.js,manifest.json,icon*.png} userjs/chromebuild/

echo 'Packaging Opera...'
rm -f danbooruup.oex
(cd userjs/operaext; zip -X ../../danbooruup.oex config.xml index.html icon*.png includes/danbooruUpUserJS.js)

echo
echo Versions
grep version install.rdf | tail -n 1
grep @version userjs/danbooruUpUserJS.js.template
grep version userjs/chromeext/manifest.json
grep version userjs/operaext/config.xml | tail -n 1
