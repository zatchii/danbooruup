// vim: set ts=8 sw=8 noet :
// crappy global that shouldn't be here, but since there is only one popup context menu
var danbooruImgNode	= null;
// namespace pollution ahoy
var StrBundleSvc	= Components.classes['@mozilla.org/intl/stringbundle;1']
			.getService(Components.interfaces.nsIStringBundleService);
var prefService		= Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefBranch);
var ioService		= Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);

var danbooruUpMsg	= StrBundleSvc.createBundle('chrome://danbooruup/locale/danbooruUp.properties');

var tagService;
var danbooruHelperService;

/*
try {
	tagService = Components.classes["@unbuffered.info/danbooru/taghistory-service;1"]
			.getService(Components.interfaces.danbooruITagHistoryService);
} catch(x) {
	var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			.getService(Components.interfaces.nsIPromptService);
	promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.ac.component'));
}
*/

try {
	danbooruHelperService = Components.classes["@unbuffered.info/danbooru/helper-service;1"]
			.getService(Components.interfaces.danbooruIHelperService);
	tagService = danbooruHelperService.tagService;
} catch(x) {
	var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			.getService(Components.interfaces.nsIPromptService);
	promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.h.component'));
}


function danbooruUpHitch(ctx, what)
{
	return function() { return ctx[what].apply(ctx, arguments); }
}

function danbooruImageContext(e) {
	document.getElementById("danbooru-image").hidden = true;
	if( gContextMenu.onImage && danbooruHelperService ) {
		document.getElementById("danbooru-image").hidden = false;
		danbooruImgNode = gContextMenu.target;
	}
	return;
}

var danbooruUpObject = new Object();

danbooruUpObject.uploadImage = function() {
	var imgURIStr	= danbooruImgNode.getAttribute("src");

	//var thistab	= getBrowser().selectedBrowser;
	var thistab	= getBrowser().selectedTab;

	var locationURI	= ioService.newURI(danbooruImgNode.ownerDocument.location.href,
					danbooruImgNode.ownerDocument.characterSet, null);
	var imgURI = ioService.newURI(imgURIStr, danbooruImgNode.ownerDocument.characterSet, locationURI);

	var referrerHref = danbooruImgNode.ownerDocument.referrer;

	// update synchronously
	try {
		if(prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.beforedialog"))
			danbooruHelperService.update(false, false, null);
	} catch (e) {
	}

	// focus existing upload box if we find it
	var wm = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator);
	var en = wm.getEnumerator("danbooru:UploadBox");

	while (en.hasMoreElements())
	{
		var w = en.getNext();
		if (w.arguments[0].wind == thistab) {
			w.arguments = [{imageLocation:locationURI, imageURI:imgURI, referrer:referrerHref, wind:thistab}];
			w.init();
			w.focus();
			return;
		}
	}

	// dialog=yes raises asserts that I don't feel like ignoring all the time using a debug build
	// we need to use a contentWindow's openDialog since window.openDialog will spawn only one using the browser's window
	(new XPCNativeWrapper(thistab.linkedBrowser.contentWindow)).openDialog("chrome://danbooruup/content/danbooruUpBox.xul",
		"danbooruUpBox", "centerscreen,chrome,dialog=no,resizable=yes",
		{imageLocation:locationURI, imageURI:imgURI, referrer:referrerHref, wind:thistab});
}

danbooruUpObject.contentLoad = function(e)
{
	danbooruHelperService.contentLoaded({ wrappedJSObject: e.target.defaultView.wrappedJSObject });
}

danbooruUpObject.init = function(e) {
	var menu = document.getElementById("contentAreaContextMenu");
	menu.addEventListener("popupshowing",danbooruImageContext,false);
	menu.addEventListener("onpopupshowing",danbooruImageContext,false);

	if(prefService.getCharPref("extensions.danbooruUp.tooltipcrop") != "default")
	{
		document.getElementById("aHTMLTooltip").setAttribute("crop",
			prefService.getCharPref("extensions.danbooruUp.tooltipcrop"));
	}

	document.getElementById("appcontent").addEventListener("DOMContentLoaded",
		danbooruUpHitch(danbooruUpObject, "contentLoad"), false);

}

// this will, of course, leak a little for every browser window
window.addEventListener("load", danbooruUpHitch(danbooruUpObject,"init"), false);

