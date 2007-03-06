// applies custom CSS for tag types to XUL windows

function danbooruAddTagTypeStyleSheet() {
	const TAGTYPE_COUNT = 5;
	var css = "";
	var selector = ".danbooru-autocomplete-treebody";
	var column = "treecolAutoCompleteValue";
	var sid = "";
	var optionsDialog = false;

	if(document.location.href == "chrome://danbooruup/content/danbooruUpOptions.xul") {
		optionsDialog = true;

		sid = "-sid" + gDanbooruManager.getSID();
		selector = "#tagTreeBody" + selector;
		column = "tagTree-type";
	}
//selector='treechildren';

	var prefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.tagtype.");

	function getStyle(st)
	{
		var s = '';
		if(optionsDialog)
			try { s = gDanbooruManager._styles[st]; } catch (ex) { }
		if(!s)
			try { s = prefs.getCharPref(st); } catch (ex) { }
//	Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService).
//		logStringMessage(st + " ---\n" + s);

		return s;
	}

	// construct rules
	for(var i=0, head, rule; i<TAGTYPE_COUNT; i++) {
		head = selector + "::-moz-tree-cell-text(danbooru-tag-type-" + i + sid + ", " + column;

		rule = getStyle(i).replace(/[{}]/g, '');
		css += head + ")\n{\n" + rule + "\n}\n";

		rule = getStyle(i+".selected").replace(/[{}]/g, '');
		css += head + ", selected)\n{\n" + rule + "\n}\n";
	}

	//css += selector + "::-moz-tree-cell-text\n{\n-moz-padding-start: "+gDanbooruManager.getSID()+"px !important;\n}\n";
	//css += selector + "::-moz-tree-cell-text(selected)\n{\nfont-weight: bold;\n}\n";
//	Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService).
//		logStringMessage(css);

	var data = "data:text/css;base64," + btoa(css);
	var pi = document.createProcessingInstruction('xml-stylesheet', 'type="text/css" href="' + data + '"');
	pi.name = "danbooruUpTagTypeStyleSheet";

	// remove old PI, doesn't do anything in gecko 1.8 though
	if(document.firstChild.name == "danbooruUpTagTypeStyleSheet")
	{
		document.removeChild(document.firstChild);
	}

	document.insertBefore(pi, document.firstChild);

	if(optionsDialog) {
		gDanbooruManager.invalidateTagTree();
	}
}

/*
treechildren.danbooru-autocomplete-treebody::-moz-tree-row(selected) {
  background-color: Highlight;
}
treechildren.danbooru-autocomplete-treebody::-moz-tree-cell-text(selected) {
  color: HighlightText !important;
}
*/

//if(document.location.href != "chrome://danbooruup/content/danbooruUpOptions.xul")
//	setTimeout(danbooruAddTagTypeStyleSheet, 200);

