var strBundleSvc = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
var helperSvc = Components.classes['@unbuffered.info/danbooru/helper-service;1'].getService(Components.interfaces.danbooruIHelperService);

var neckoBundle	= strBundleSvc.createBundle("chrome://necko/locale/necko.properties");
var danBundle = strBundleSvc.createBundle('chrome://danbooruup/locale/danbooruUp.properties');

var gListener = null;

function $(n) { return document.getElementById(n); }

function onLoad()
{
	init();
	if (gListener)
	{
		gListener.Components = Components;
		var obsSvc = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		obsSvc.addObserver(gListener, "danbooru-update-done", false);
		obsSvc.addObserver(gListener, "danbooru-update-failed", false);
	}
}

function onUnload()
{
	if (gListener)
	{
		var obsSvc = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		try { obsSvc.removeObserver(gListener, "danbooru-update-done"); } catch(e) { __log(e); }
		try { obsSvc.removeObserver(gListener, "danbooru-update-failed"); } catch(e) { __log(e); }
	}
}

function init()
{
	$('progress').mode = 'undetermined';
	$('button').setAttribute('label',danBundle.GetStringFromName('danbooruUp.msg.cancel'));
	switch(window.arguments[0].action)
	{
	case 'tagupdate':
		if (!gListener) gListener = new DanbooruDownloadListener();
		try {
			var cancel = helperSvc.update(true, gListener);
			gListener.init(cancel);
		} catch (e if e.result == kErrorNotAvailable) {
			window.close();
		}
		break;
	default:
		break;
	}
}

function __log(msg) {
	if (typeof msg == 'object') {
		var e = Components.classes["@mozilla.org/scripterror;1"].createInstance(Components.interfaces.nsIScriptError);
		e.init(e.message, e.fileName, '', e.lineNumber, 0, Components.interfaces.nsIScriptError.errorFlag, 'component javascript');
		Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService).logMessage(e);
	} else {
		Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService).logStringMessage(msg);
	}
}

//enumerateWindows();scope(Shell.enumWins[1]);w=(new XPCNativeWrapper(getBrowser().selectedTab.linkedBrowser.contentWindow)).openDialog("chrome://danbooruup/content/danbooruUpDown.xul", "danbooruUpDown", "centerscreen,chrome,dialog=yes,modal=no", {});

function clicked(evt)
{
	if (gListener.finished) {
		window.close();
	} else if (gListener.error) {
		init(); // Retry
	} else {
		gListener.cancel();
	}
}

function DanbooruDownloadListener()
{
}

DanbooruDownloadListener.prototype = {
	mInteractive: true,
	mStatus: "",
	mCanceller: null,
	mError: false,
	mFinished: false,

	set finished(x) { this.mFinished = x; },
	get finished() { return this.mFinished; },
	set error(x) { this.mError = x; },
	get error() { return this.mError; },

	init: function(canceller) {
		this.mCanceller = canceller;
		this.mError = false;
		this.mFinished = false;
		this.mStatus = "";
	},

	cancel : function()
	{
		if (this.mCanceller) {
			this.mCanceller.cancel();
			this.mCanceller = null;
		}
		return !($('button').disabled);
	},

	progress: function(aStatus, aProgress, aProgressMax)
	{
		if (!this.mInteractive) return;

		if (aProgressMax > 0 && aProgress > 0) {
			$('progress').mode = 'determined';
			$('progress').setAttribute('value', aProgress/aProgressMax*100);
		} else {
			$('progress').mode = 'undetermined';
		}

		if (aStatus == this.mStatus)
			return;

		var msg;
		switch (aStatus) {
		case 'connecting':
			msg = danBundle.GetStringFromName('danbooruUp.msg.connecting');
			break;
		case 'downloading':
			msg = danBundle.GetStringFromName('danbooruUp.msg.reading');
			break;
		case 'inserting':
			msg = danBundle.GetStringFromName('danbooruUp.msg.processing');
			$('button').disabled = true;
			break;
		default:
			msg = aStatus;
			break;
		}

		$('label').setAttribute('value', msg);
	},

	observe: function(aSubject, aTopic, aData)
	{
		if (!this.mInteractive)
			return;
		switch (aTopic) {
		case "danbooru-update-done":
			aSubject.QueryInterface(Components.interfaces.nsISupportsPRUint32);
			$('label').setAttribute('value', danBundle.formatStringFromName("danbooruUp.opt.updatedTags", [aSubject.data], 1));
			$('button').disabled = false;
			$('button').setAttribute('label', danBundle.GetStringFromName('danbooruUp.msg.done'));
			$('progress').mode = 'determined';
			this.mFinished = true;
			break;
		case "danbooru-update-failed":
			var msg;
			switch (aData) {
				case 'request_error':
					msg = danBundle.GetStringFromName('danbooruUp.err.errorRetrievingTags');
					break;
				case 'cancelled':
					msg = danBundle.GetStringFromName('danbooruUp.msg.readcancel');
					break;
				default:
					msg = aData;
					break;
			}
			$('label').setAttribute('value', msg);
			$('button').setAttribute('label', danBundle.GetStringFromName('danbooruUp.msg.retry'));
			$('button').disabled = false;
			$('progress').mode = 'determined';
			this.mError = true;
			break;
		}
	},

	// nsISupports
	QueryInterface : function(aIID)
	{
		if (aIID.equals(Components.interfaces.nsIPrompt)
			|| aIID.equals(Components.interfaces.nsISupports)
			|| aIID.equals(Components.interfaces.nsISupportsWeakReference)
			|| aIID.equals(Components.interfaces.nsIInterfaceRequestor)
			|| aIID.equals(Components.interfaces.nsIClassInfo))
			return this;
		throw Components.results.NS_NOINTERFACE;
	},

	// nsIClassInfo
	classDescription: null,
	classID: null,
	contractID: null,
	implementationLanguage: Components.interfaces.nsIProgrammingLanguage.JAVASCRIPT,
	flags: Components.interfaces.nsIClassInfo.DOM_OBJECT,
	getHelperForLanguage: function(lang) { return null; },
	getInterfaces: function(ct)
	{
		var array = [ Components.interfaces.nsIPrompt,
				Components.interfaces.nsISupportsWeakReference,
				Components.interfaces.nsIInterfaceRequestor,
				Components.interfaces.nsIClassInfo]
		ct.value = array.length;
		return array;
	},

	get wrappedJSObject() { return this; },

	// nsIInterfaceRequestor
	getInterface : function(aIID)
	{
		return this.QueryInterface(aIID);
	}
};

AddDanbooruPromptWrapper(DanbooruDownloadListener.prototype);

