DEPTH		= /cygdrive/c/mingw/work/mozilla/obj-i686-pc-cygwin
topsrcdir	= /cygdrive/c/mingw/work/mozilla
srcdir		= .
VPATH		= .

include $(DEPTH)/config/autoconf.mk

XPIDL_MODULE	= danbooruUpJSModule

XPIDLSRCS	= danbooruUpHelper.idl \
		  danbooruUpJSAutoComplete.idl \
		  $(NULL)

EXTRA_COMPONENTS = danbooruUpHelper.js \
		   danbooruUpJSAutoComplete.js

include $(topsrcdir)/config/rules.mk

