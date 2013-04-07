#!/bin/sh

set -e

XPIDL="python xulrunner-sdk/sdk/bin/typelib.py"
XPT_LINK="python xulrunner-sdk/sdk/bin/xpt.py link"
IDL_DIR="xulrunner-sdk/idl"

for I in *.idl; do
	$XPIDL -I "$IDL_DIR" -o `basename $I .idl`.xpt $I
done

$XPT_LINK danbooruac.xpt *.xpt
mv danbooruac.xpt ..
rm *.xpt
