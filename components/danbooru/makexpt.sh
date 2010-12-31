#!/bin/sh

set -e

XPIDL=~/source/firefox/ff-dbg/dist/bin/xpidl
XPT_LINK=~/source/firefox/ff-dbg/dist/bin/xpt_link

for I in *.idl; do
	$XPIDL -m typelib -I ~/source/firefox/ff-dbg/dist/idl/ -o `basename $I .idl` $I
done

$XPT_LINK danbooruac.xpt *.xpt
mv danbooruac.xpt ..
rm *.xpt
