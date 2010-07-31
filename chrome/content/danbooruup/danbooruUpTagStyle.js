// -*- Mode: javascript; tab-width: 8; indent-tabs-mode: t; javascript-indent-level: 8; -*-
// applies custom CSS for tag types to XUL windows

function danbooruAddTagTypeStyleSheet(getStyle, sidn) {
	const TAGTYPE_COUNT = 8;
	var selector = '.danbooru-autocomplete';
	var column = ' description';
	var sid = '';

	// Version the classes, useful if you can't remove styles.
	if (sidn)
		sid = '-sid' + sidn;

	// construct rules
	var css = "";
	for(var i=0, head, rule; i<TAGTYPE_COUNT; i++) {
		css += selector + ' .danbooru-tagtype-' + i + sid + '' + column;
		css += '\n{\n' + getStyle(i) + '\n}\n';

		css += selector + ' .danbooru-tagtype-' + i + sid + '[selected="true"]' + column;
		css += '\n{\n' + getStyle(i+'.selected')  + '\n}\n';
	}

	var data = "data:text/css;base64," + btoa(css);
	var pi = document.createProcessingInstruction('xml-stylesheet', 'type="text/css" href="' + data + '"');
	pi.name = "danbooruUpTagTypeStyleSheet";

	// remove old PI, doesn't do anything in gecko 1.8 though
	if(document.firstChild.name && document.firstChild.name == "danbooruUpTagTypeStyleSheet")
	{
		document.removeChild(document.firstChild);
	}

	document.insertBefore(pi, document.firstChild);
}

