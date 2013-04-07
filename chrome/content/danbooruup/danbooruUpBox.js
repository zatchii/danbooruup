const promptService	= Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
				.getService(Components.interfaces.nsIPromptService);
const prefService	= Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefBranch);
var danbooruUpMsg	= Components.classes['@mozilla.org/intl/stringbundle;1']
				.getService(Components.interfaces.nsIStringBundleService)
				.createBundle('chrome://danbooruup/locale/danbooruUp.properties');

// Rewrite Pixiv thumbnail URLs.
function rewrite_url(url)
{
	var match = /^(.*?\.pixiv\.net\/img\/.+?\/.+?)_[ms](.+)$/.exec(url);
	if (match)
		url = match[1] + match[2];

	return url;
}


function init()
{
	var ml = document.getElementById('danbooru');
	ml.selectedIndex = -1;
	ml.removeAllItems();
	gDanbooruManager.init(ml);

	document.getElementById('tags').focus();

	var source = '';
	if ('arguments' in window) {
		// Check and fix Pixiv thumbnail URLs
		var imgurl = window.arguments[0].imageURI.spec;
		var newurl = rewrite_url(imgurl);
		if (imgurl != newurl) {
			window.arguments[0].imageURI.spec = newurl;
			document.getElementById('rewrite_notification').hidden = false;
		}

		window.locations = [window.arguments[0].imageLocation.spec];

		if(!window.arguments[0].imageLocation.equals(window.arguments[0].imageURI))
			window.locations.push(window.arguments[0].imageURI.spec);

		if(window.arguments[0].referrer)
			window.locations.unshift(window.arguments[0].referrer);

		if (prefService.getBoolPref("extensions.danbooruUp.fileurlsource") || !(window.arguments[0].imageURI.scheme == 'file') )
			source = window.arguments[0].imageURI.spec;
	} else {
		window.locations = [];
	}

	document.getElementById('source').value = source;
	doSwitchSource(0);

	document.getElementById('noForward').checked = prefService.getBoolPref('extensions.danbooruUp.noforward');

	if (prefService.getBoolPref('extensions.danbooruUp.autocomplete.enabled') && completer.tagService) {
		var context = ['__ALL__'];
		if ('arguments' in window) {
			// The components of the host name except the TLD, and the components of the path except the filename
			context = context.concat(window.arguments[0].imageURI.host.split('.').slice(0, -1),
					window.arguments[0].imageURI.path.split('/').filter(function (x) {return x}).slice(0, -1));
		}
		completer.context = context;
		new AutoCompleter(document.getElementById('tags'), completer, danbooruACXULPopup, 'post');

		let stylePrefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.tagtype.");
		setTimeout(function() {danbooruAddTagTypeStyleSheet(function(style) {return stylePrefs.getCharPref(style)});}, 100);
	}

}

function doSwitchSource(dir) {
	var srcFld = document.getElementById('source');
	for (var i = 0; i < window.locations.length; i++) {
		if (window.locations[i] == srcFld.value)
			break;
	}

	i += dir;
	if (dir && (i < 0 || i >= window.locations.length))
		return;

	var prev_b = document.getElementById('prevSrcBtn');
	var next_b = document.getElementById('nextSrcBtn');
	if (i == 0) {
		prev_b.disabled = true;
		next_b.disabled = window.locations.length <= 1;
	} else if (i >= window.locations.length - 1) {
		prev_b.disabled = i == 0;
		next_b.disabled = true;
	} else {
		prev_b.disabled = false;
		next_b.disabled = false;
	}

	if (dir && i < window.locations.length)
		srcFld.value = window.locations[i];

	if (i == window.locations.length - 1 && srcFld.value.match(/^http:\/\//))
		document.getElementById('noForward').disabled = false;
	else
		document.getElementById('noForward').disabled = true;
}

function onSourceInput() {
	doSwitchSource(0);
	return false;
}

function doOK()
{
	var ml = document.getElementById('danbooru');
	var tags = document.getElementById('tags').value;
	var rating = ['Explicit','Questionable','Safe'][document.getElementById('ratinggrp').selectedIndex];
	gDanbooruManager.selectDanbooru(ml.selectedIndex);
	gDanbooruManager.uninit();

	var helpersvc= Components.classes["@unbuffered.info/danbooru/helper-service;1"]
			.getService(Components.interfaces.danbooruIHelperService);
	var needupdate = false;
	if (tags.length) {
		try {
			// Push tags to completer object.
			document.getElementById('tags').danbooruUpAutoCompleter.onSubmit();
			var tagarr = completer.submitted_tags;
			var context = completer.context;
			var tagHist = helpersvc.tagService;
			needupdate = !tagHist.updateTagHistory(tagarr, context);
		} catch (e) {
			// silently fail
		}
		needupdate = prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.afterdialog") && needupdate;
	}

	var noForward = document.getElementById('noForward');
	if (!noForward.disabled)
		prefService.setBoolPref('extensions.danbooruUp.noforward', noForward.checked);

	helpersvc.startUpload(
			window.arguments[0].imageURI,
			document.getElementById('source').value,
			tags,
			rating,
			ml.label,
			window.arguments[0].imageLocation,
			window.arguments[0].wind,
			!noForward.disabled && noForward.checked,
			needupdate
		);
	window.arguments[0].imageLocation = null;
	window.arguments[0].wind = null;
	window.arguments=null;

	return true;
}
function doCancel() {
	return true;
}
function refocus() {
	this.removeEventListener("focus",refocus,false);
	setTimeout(function(){window.focus()},10);
}
function doSwitchTab() {
	var tab = window.arguments[0].wind;
	var currentTab = tab.linkedBrowser.getTabBrowser().selectedTab;

	// the easy way, but not the right way:
	// 	tab.linkedBrowser.getTabBrowser().ownerDocument.__parent__.focus();
	var browserWindow = tab.linkedBrowser.contentWindow
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
					.getInterface(Components.interfaces.nsIWebNavigation)
				.QueryInterface(Components.interfaces.nsIDocShellTreeItem)
					.rootTreeItem
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
					.getInterface(Components.interfaces.nsIDOMWindow);

	// tab (but not window) switching is on a timeout of 0 so we have to wait until we're blurred before refocusing
	browserWindow.addEventListener("focus",refocus,false);

	if (currentTab != tab) {
		tab.linkedBrowser.getTabBrowser().selectedTab = tab;
	} else {
		browserWindow.focus();
	}

	return true;
}
function doArtistSearch() {
	var ml = document.getElementById('danbooru');
	var btn = document.getElementById('artistSearch');
	var imguri = document.getElementById('source').value;
	var posturi = ml.label;

	btn.setAttribute("image", "chrome://global/skin/throbber/Throbber-small.gif");


	var tagService =  Components.classes["@unbuffered.info/danbooru/helper-service;1"]
		.getService(Components.interfaces.danbooruIHelperService).tagService;

	tagService.artistSearch(imguri, posturi, artistLoad, artistError);

	function artistLoad(url, names) {
		document.getElementById('artistSearch').setAttribute("image", "chrome://danbooruup/skin/glass-trimmed.png");

		if (names.length == 1) {
			var tags = document.getElementById('tags');
			var append = names[0] + ' ';
			if (append)
			{
				if (!tags.value.match(/\s$/))
					append = ' ' + append;
				tags.value += append;
				return;
			}
		}
		var s=Components.classes['@mozilla.org/sound;1'].createInstance(Components.interfaces.nsISound);
		s.beep();
		return;
	}
	function artistError(error, info) {
		var msg;
		if (error == 'http_error') {
			msg = danbooruUpMsg.GetStringFromName('danbooruUp.err.serverresponse') + info;
		} else if (error == 'bad_json') {
			msg = danbooruUpMsg.GetStringFromName('danbooruUp.err.parse');
		} else if (error == 'request_error') {
			msg = danbooruUpMsg.GetStringFromName('danbooruUp.err.artistsearchfailed.network')
		} else {
			msg = danbooruUpMsg.GetStringFromName('danbooruUp.err.artistsearchfailed');
		}
		promptService.alert(window, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), msg);

		document.getElementById('artistSearch').setAttribute("image", "chrome://danbooruup/skin/glass-trimmed.png");
	}
}

var completer = {
	timer: Components.classes['@mozilla.org/timer;1'].createInstance(Components.interfaces.nsITimer),
	running: false,
	cur_tag: '',
	cur_callback: null,
	context: null,	// Set from init()
	submitted_tags: null,

	tagService: Components.classes["@unbuffered.info/danbooru/helper-service;1"]
		.getService(Components.interfaces.danbooruIHelperService).tagService,

	getSuggestions: function(tag, prefix, search_type, callback)
	{
		if (!this.running) {
			this.timer.init(this, 100, this.timer.TYPE_ONE_SHOT);
			this.running = true;
		}
		this.cur_tag = tag;
		this.cur_prefix = prefix;
		this.cur_search_type = search_type;
		this.cur_callback = callback;
	},

	abortSuggestion: function()
	{
		this.timer.cancel();
		this.running = false;
	},

	// Called by timer, time to do search
	observe: function(subject, topic, data)
	{
		this.running = false;
		this.tagService.autocompleteSearch(this.cur_tag.toLowerCase(), this.cur_prefix.toLowerCase(), this.context, this.cur_callback);
	},

	getRelated: function(tag, callback)
	{
		this.tagService.searchRelatedTags(tag, callback);
	},

	onSubmit: function(search_type, tags)
	{
		this.submitted_tags = tags;
	},

	openBrowserTab: function(tag)
	{
		var ioService = Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
		var br = wm.getMostRecentWindow("navigator:browser");

		var boardUri = document.getElementById('danbooru').label;
		var uri = ioService.newURI(boardUri, null, null).QueryInterface(Components.interfaces.nsIURL);
		uri.path = uri.path.replace(/\/[^/]+\/[^/]+$/, "/post/index");

		uri.query = "tags=" + encodeURIComponent(tag);

		br.getBrowser().selectedTab = br.getBrowser().addTab(uri.spec);
	},

	prefCompleteWithTab: function()
	{
		return prefService.getBoolPref('extensions.danbooruUp.autocomplete.completewithtab');
	},

	prefSuggestPrefixes: function()
	{
		return prefService.getBoolPref('extensions.danbooruUp.autocomplete.suggestprefixes');
	},
};
