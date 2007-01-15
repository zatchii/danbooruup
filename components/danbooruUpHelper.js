const DANBOORUUPHELPER_CLASSNAME = "danbooruHelperService";
const DANBOORUUPHELPER_CONTRACTID = "@unbuffered.info/danbooru/helper-service;1";
const DANBOORUUPHELPER_CID = Components.ID("{d989b279-ba03-4b12-adac-925c7f0c4b9d}");

const Cc = Components.classes;
const Ci = Components.interfaces;

const prefService	= Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
const ioService		= Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const promptService	= Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
const tagService	= Cc["@unbuffered.info/danbooru/taghistory-service;1"].getService(Ci.nsIDanbooruTagHistoryService);
const obService		= Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

const cMinTagUpdateInterval = 5 * 60 * 1000;

function alert(msg)
{
	promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), msg);
}

function danbooruUpHitch(ctx, what)
{
	return function() { return ctx[what].apply(ctx, arguments); }
}

Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader)
	.loadSubScript("chrome://danbooruup/content/uploader.js");

var danbooruUpHelperObject = {

	startup: function()
	{
		Cc["@mozilla.org/moz/jssubscript-loader;1"]
			.getService(Ci.mozIJSSubScriptLoader)
			.loadSubScript("chrome://global/content/XPCNativeWrapper.js");

		obService.addObserver(this, "danbooru-options-changed", false);

		this._branch = prefService.getBranch("extensions.danbooruUp.");
		this._branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this._branch.addObserver("", this, false);

		this.startupUpdate();

		this.loadScripts();
	},
	unregister: function()
	{
		obService.removeObserver("profile-after-change", this);
		if(this._branch)
			obService.removeObserver("", this);
	},

	//
	// danbooruTagUpdater
	//
	mMaxID:-1,
	mTimer:null,

	getMaxID: function()
	{
		try {
			return tagService.maxID;
		} catch(e) {
			promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.maxid'));
		}
		return 0;
	},
	observe: function(aSubject, aTopic, aData)
	{
		//var os	= Components.classes["@mozilla.org/observer-service;1"]
		//	.getService(Components.interfaces.nsIObserverService);
		//os.removeObserver(this, "browser-window-before-show");
		switch (aTopic) {
		case 'app-startup':
			// cat. "app-startup"/topic "app-startup" is too soon, since we
			// need to open the DB file in the profile directory
			obService.addObserver(this, "profile-after-change", false);
			break;
		case 'profile-after-change':
			this.startup();
			break;
		case 'nsPref:changed':
			this.startTimer();
			if(prefService.getCharPref("extensions.danbooruUp.tooltipcrop") != "default")
				document.getElementById("aHTMLTooltip").setAttribute("crop",
					prefService.getCharPref("extensions.danbooruUp.tooltipcrop"));
			break;
		}
	},
	startTimer: function()
	{
		if (this.mTimer)
			this.mTimer.cancel();
		if (!prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.ontimer"))
			return;
		this.mTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
		this.mTimer.initWithCallback(this, prefService.getIntPref("extensions.danbooruUp.autocomplete.update.interval")*60*1000, this.mTimer.TYPE_REPEATING_SLACK);
	},
	startupUpdate: function()
	{
		if (!tagService) return;
		var full = true;
		if (!prefService.getBoolPref("extensions.danbooruUp.autocomplete.enabled"))
			return;
		if (!prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.onstartup"))
			return;
		if (prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.faststartup") &&
			tagService.rowCount > 0) {
			full = false;
			this.mMaxID = this.getMaxID();
		}
		this.update(full, false);
	},
	notify: function(aTimer)
	{
		if (!prefService.getBoolPref("extensions.danbooruUp.autocomplete.enabled"))
			return;
		if (!prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.ontimer"))
		{
			aTimer.cancel();
			this.mTimer = null;
			return;
		}
		this.update(false, false);
	},
	update: function(aFull, aInteractive)
	{
		if (!tagService) return;
		if (prefService.getIntPref("extensions.danbooruUp.autocomplete.update.lastupdate") < Date.now() + cMinTagUpdateInterval) return;
		var locationURL	= ioService.newURI(prefService.getCharPref("extensions.danbooruUp.updateuri"), '', null)
				.QueryInterface(Ci.nsIURL);
		if(this.mMaxID>0 && !aFull)
		{
			locationURL.query = "after_id="+(this.mMaxID+1);
		}
		try {
			tagService.updateTagListFromURI(locationURL.spec, true);
		} catch (e) {
			if(e.result==Components.results.NS_ERROR_NOT_AVAILABLE)
			{
				if(aInteractive)
					promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.updatebusy'));
			}
			else {
				promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.exc') + e);
			}
		}
		this.mMaxID = this.getMaxID();
		prefService.setIntPref("extensions.danbooruUp.autocomplete.update.lastupdate", Date.now());

		if (prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.ontimer") && !this.mTimer)
		{
			this.startTimer();
		}
	},
	cleanup: function(aInteractive)
	{
		var locationURL	= ioService.newURI(prefService.getCharPref("extensions.danbooruUp.updateuri"), '', null)
				.QueryInterface(Ci.nsIURL);
		try {
			tagService.updateTagListFromURI(locationURL.spec, false);
		} catch (e) {
			if(e.result==Components.results.NS_ERROR_NOT_AVAILABLE)
			{
				if(aInteractive)
					promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.updatebusy'));
			}
			else {
				promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.exc') + e);
			}
		}
	},

	//
	//
	//
	startUpload: function(aRealSource, aSource, aTags, aRating, aDest, aLocation, aWind, aUpdate)
	{
		var uploader;
		var imgChannel	= ioService.newChannelFromURI(aRealSource);

		if (aRealSource.scheme == "file") {
			imgChannel.QueryInterface(Components.interfaces.nsIFileChannel);
			uploader = new danbooruUploader(aRealSource, aSource, aTags, aRating, aDest, aWind, true, aWind.linkedBrowser.contentDocument.location, aUpdate);
			// add entry to the observer
			obService.addObserver(uploader, "danbooru-down", false);
			imgChannel.asyncOpen(uploader, imgChannel);
		} else {
			var cookieJar	= Components.classes["@mozilla.org/cookieService;1"]
				.getService(Components.interfaces.nsICookieService);
			var cookieStr = cookieJar.getCookieString(aLocation, null);

			imgChannel.QueryInterface(Components.interfaces.nsIHttpChannel);
			imgChannel.referrer = aLocation;
			imgChannel.setRequestHeader("Cookie", cookieStr, true);

			// don't need to bother with Uploader's array transfer
			var listener = Components.classes["@mozilla.org/network/simple-stream-listener;1"]
				.createInstance(Components.interfaces.nsISimpleStreamListener);
			uploader = new danbooruUploader(aRealSource, aSource, aTags, aRating, aDest, aWind, false, aWind.linkedBrowser.contentDocument.location, aUpdate);

			// add entry to the observer
			obService.addObserver(uploader, "danbooru-down", false);
			listener.init(uploader.mOutStr, uploader);
			imgChannel.asyncOpen(listener, imgChannel);
		}
	},

	//
	// danbooruSiteAutocompleter
	//
	script_src:[],
	script_ins:'',
	files: ["chrome://danbooruup/content/extra/prototype.js",
		"chrome://danbooruup/content/extra/effects.js",
		"chrome://danbooruup/content/extra/controls.js",
		"chrome://danbooruup/content/extra/du-autocompleter.js"
		],
	loadScripts: function (e)
	{
		if(this.script_src.length) return;
		try {
			for(var i=0; i < this.files.length; i++) {
				var script = ioService.newURI(this.files[i],null,null)
				this.script_src.push(this.getContents(script));
			}
			this.script_ins = this.getContents(ioService.newURI("chrome://danbooruup/content/extra/ac-insert.js",null,null));
		} catch(x) { Components.utils.reportError(x); }
	},

	contentLoaded: function (win)
	{
		var unsafeWin = win.wrappedJSObject;
		var unsafeLoc = new XPCNativeWrapper(unsafeWin, "location").location;
		var href = new XPCNativeWrapper(unsafeLoc, "href").href;
		var winUri = ioService.newURI(href, null, null);

		var sites = prefService.getCharPref("extensions.danbooruUp.postadduri").split("`");

		for (var i = 0; i < sites.length; ++i) {
			try {
				var uri = ioService.newURI(sites[i], null, null);
				if (winUri.prePath != uri.prePath) continue;

				if (winUri.path.match(/\/post\/(list|view)[^_]/)) {
					this.inject(href, unsafeWin);
					return;
				}
				if ((new XPCNativeWrapper(unsafeWin)).document.getElementById("static-index"))
				{
					this.inject(href, unsafeWin);
					return;
				}
			} catch(x) {}
		}
		return;
	},

	searchTags: function (s)
	{
		var t={}, c={};
		Cc["@unbuffered.info/danbooru/taghistory-service;1"].getService(Ci.nsIDanbooruTagHistoryService).searchTags(s,t,c);
		return t.value;
	},

	inject: function (url, unsafeContentWin)
	{
		// we want our prototype/effects/control.js scripts to run in a sandbox
		var safeWin = new XPCNativeWrapper(unsafeContentWin);
		var sandbox = new Components.utils.Sandbox(safeWin);
		sandbox.window = safeWin;
		sandbox.document = sandbox.window.document;
		sandbox.unsafeWindow = unsafeContentWin;
		sandbox.GM_log = danbooruUpHitch(this, "log");
		sandbox.danbooruUpSearchTags = danbooruUpHitch(this, "searchTags");
		sandbox.__proto__ = safeWin;
		try {
			// load in the source from the content package
			Components.utils.evalInSandbox("var script_arr = [];", sandbox);
			for(var i=0; i < this.script_src.length; i++) {
				sandbox.script_arr.push(this.script_src[i]);
			}

			// load in the inserter script
			Components.utils.evalInSandbox(this.script_ins, sandbox);
		} catch (x) {
			Components.utils.reportError(x);
		}
	},

	log: function(msg) {
		Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).logStringMessage(msg);
	},

	getContents: function(aURL, charset) {
		if( !charset ) {
			charset = "UTF-8"
		}
		var scriptableStream = Cc["@mozilla.org/scriptableinputstream;1"]
			.getService(Ci.nsIScriptableInputStream);
		var unicodeConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
			.createInstance(Ci.nsIScriptableUnicodeConverter);
		unicodeConverter.charset = charset;

		var channel=ioService.newChannelFromURI(aURL);
		var input=channel.open();
		scriptableStream.init(input);
		var str=scriptableStream.read(input.available());
		scriptableStream.close();
		input.close();

		try {
			return unicodeConverter.ConvertToUnicode(str);
		} catch( e ) {
			return str;
		}
	},

	// XPCOM Glue stuff
	QueryInterface: function(iid)
	{
		if (!iid.equals(Ci.nsIObserver) &&
		    !iid.equals(Ci.danbooruIHelperService) &&
		    !iid.equals(Ci.nsISupports) &&
		    !iid.equals(Ci.nsISupportsWeakReference))
			throw Components.results.NS_ERROR_NO_INTERFACE;
		return this;
	},

	get wrappedJSObject() { return this; }
}

// Component registration
var HelperModule = new Object();

HelperModule.registerSelf = function(compMgr, fileSpec, location, type)
{
	compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
	compMgr.registerFactoryLocation(DANBOORUUPHELPER_CID,
			"Danbooru Helper Service",
			DANBOORUUPHELPER_CONTRACTID,
			fileSpec,
			location,
			type);

	var catMgr = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);

	catMgr.addCategoryEntry("app-startup",
			DANBOORUUPHELPER_CLASSNAME,
			DANBOORUUPHELPER_CONTRACTID,
			true,
			true);

}

HelperModule.getClassObject = function(compMgr, cid, iid)
{
	if (!cid.equals(DANBOORUUPHELPER_CID))
		throw Components.results.NS_ERROR_NO_INTERFACE;
	if (!iid.equals(Ci.nsIFactory))
		throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
	return HelperFactory;
}

HelperModule.canUnload = function(compMgr)
{
	return true;
}

// Returns the singleton object when needed.
var HelperFactory = new Object();

HelperFactory.createInstance = function(outer, iid)
{
	if (outer != null)
		throw Components.results.NS_ERROR_NO_AGGREGATION;
	return danbooruUpHelperObject;
}

// XPCOM Registration Function -- called by Firefox
function NSGetModule(compMgr, fileSpec)
{
	return HelperModule;
}

