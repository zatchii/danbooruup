#!/bin/sh

for I in *.idl; do
	/usr/lib/seamonkey-1.1.13/xpidl -m typelib -I /usr/share/idl/seamonkey-1.1.13/ -o `basename $I .idl` $I
done

/usr/lib/seamonkey-1.1.13/xpt_link danbooruac.xpt *.xpt
mv danbooruac.xpt ..
rm *.xpt
