function danbooruAddTagTypeStyleSheet() {
	var css = "";
	var selector = ".danbooru-autocomplete-treebody";
	var column = "treecolAutoCompleteValue";
	var sid = "";

	if(document.location.href == "chrome://danbooruup/content/danbooruUpOptions.xul") {
		sid = "-sid" + gDanbooruManager.getSID();
		selector = "#tagTreeBody" + selector;
		column = "tagTree-type";
	}

	var prefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.tagtype.");

	// construct rules
	for(var i=0, head, rule; i<5; i++) {
		head = selector + "::-moz-tree-cell-text(danbooru-tag-type-" + i + sid + ", " + column;

		rule = prefs.getCharPref(i).replace(/[{}]/g, '');
		css += head + ")\n{\n" + rule + "\n}\n";

		rule = prefs.getCharPref(i+".selected").replace(/[{}]/g, '');
		css += head + ", selected)\n{\n" + rule + "\n}\n";
	}
	var data = "data:text/css;base64," + btoa(css);
	var pi = document.createProcessingInstruction('xml-stylesheet', 'type="text/css" href="' + data + '"');

	// remove old PI, not that it changes anything
	if(document.firstChild.nodeName == "xml-stylesheet")
	{
		document.removeChild(document.firstChild);
	}

	document.insertBefore(pi, document.firstChild);

	if(document.location.href == "chrome://danbooruup/content/danbooruUpOptions.xul") {
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

// original hack version
function danbooruAddTagTypeStyleSheetHack() {
	var css =
//		".autocomplete-treebody::-moz-tree-cell-text(danbooru-tag-type-0, treecolAutoCompleteValue)\n" +
//		"{ font-family: Hymmnos; font-size: 200%;}\n" +
		".danbooru-autocomplete-treebody::-moz-tree-row(danbooru-tag-type-1, treecolAutoCompleteValue)\n" +
		"{ background-color: #44f !important; }\n" +
		".danbooru-autocomplete-treebody::-moz-tree-cell-text(danbooru-tag-type-1, treecolAutoCompleteValue)\n" +
		"{ background-color: #44f !important; }\n" +
		".danbooru-autocomplete-treebody::-moz-tree-cell-text(danbooru-tag-type-1, treecolAutoCompleteValue, selected)\n" +
		"{ background-color: #44f !important; color: #000 !important;}\n" +
		".danbooru-autocomplete-treebody::-moz-tree-cell-text(danbooru-tag-type-2, treecolAutoCompleteValue)\n" +
		"{ background-color: #4f4 !important; }\n" +
		".danbooru-autocomplete-treebody::-moz-tree-cell-text(danbooru-tag-type-3, treecolAutoCompleteValue)\n" +
		"{ background-color: #ff0 !important; }\n" +
		".danbooru-autocomplete-treebody::-moz-tree-cell-text(danbooru-tag-type-4, treecolAutoCompleteValue)\n" +
		"{ background-color: #0ff !important; }";
if(document.location.href.match(/Options/)) {
css = css.replace(/, treecolAutoCompleteValue/g, '-uid0, tagTree-type');
css = css.replace(/^\./gm, '#tagTreeBody\.');
}
	var data = "data:text/css;base64," + btoa(css);
	var pi = document.createProcessingInstruction('xml-stylesheet', 'type="text/css" href="' + data + '"');

//if(document.location.href.match(/Options/))
//	document.firstChild.insertBefore(pi, document.firstChild.firstChild);
//else
	document.insertBefore(pi, document.firstChild);
}

setTimeout(danbooruAddTagTypeStyleSheet, 100);
