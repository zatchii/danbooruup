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
		gListener.mWindow = window;
		var obsSvc = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		obsSvc.addObserver(gListener, "danbooru-update-done", false);
		obsSvc.addObserver(gListener, "danbooru-update-failed", false);
		obsSvc.addObserver(gListener, "danbooru-update-processing-max", false);
		obsSvc.addObserver(gListener, "danbooru-update-processing-progress", false);
		obsSvc.addObserver(gListener, "danbooru-cleanup-confirm", false);
	}
}

function onUnload()
{
	if (gListener)
	{
		var obsSvc = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		try { obsSvc.removeObserver(gListener, "danbooru-update-done"); } catch(e) { __log(e); }
		try { obsSvc.removeObserver(gListener, "danbooru-update-failed"); } catch(e) { __log(e); }
		try { obsSvc.removeObserver(gListener, "danbooru-update-processing-max"); } catch(e) { __log(e); }
		try { obsSvc.removeObserver(gListener, "danbooru-update-processing-progress"); } catch(e) { __log(e); }
		try { obsSvc.removeObserver(gListener, "danbooru-cleanup-confirm"); } catch(e) { __log(e); }
	}
}

function init()
{
	$('progress').mode = 'undetermined';
	$('button').setAttribute('label',danBundle.GetStringFromName('danbooruUp.msg.cancel'));
	switch(window.arguments[0].action)
	{
	case 'tagupdate':
		gListener = new DanbooruDownloadListener();
		gListener.ownerWindow = window;
		try {
			helperSvc.update(true,true,gListener);
		} catch(e if e.result == kErrorNotAvailable) {
			window.close();
		}
		break;
	case 'tagcleanup':
		gListener = new DanbooruDownloadListener();
		gListener.ownerWindow = window;
		try {
			helperSvc.cleanup(true,gListener);
		} catch(e if e.result == kErrorNotAvailable) {
			window.close();
		}
		break;
	case 'relatedtagdownload':
		gListener = new DanbooruDownloadListener();
		gListener.ownerWindow = window;
		try {
			helperSvc.downloadRelatedTagDB(true,gListener);
		} catch(e if e.result == kErrorNotAvailable) {
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
	switch (gListener.statusCode)
	{
	case kStatusReadFrom_Status:
	case kStatusWroteTo_Status:
	case kStatusReceivingFrom_Status:
	case kStatusSendingTo_Status:
	case kStatusWaitingFor_Status:
	case kStatusResolvingHost_Status:
	case kStatusConnectedTo_Status:
	case kStatusConnectingTo_Status:
		gListener.cancel();
		break;
	case kErrorFailure:
		init();
		break;
	case kNS_OK:
	case null:
	default:
		window.close();
		break;
	}
}

function DanbooruDownloadListener(outputStr, fileStr)
{
	this.mOutStream = outputStr;
	this.mFileStream = fileStr;
}

DanbooruDownloadListener.prototype = {
	mCount: 0,
	mOutStream: null,
	mFileStream: null,
	mChannel: null,
	mStatus: -1,
	mInteractive: true,
	mOwnerWindow: null,

	set outStream(x) { this.mOutStream = x; },
	get outStream() { return this.mOutStream; },
	set fileStream(x) { this.mFileStream = x; },
	get fileStream() { return this.mFileStream; },
	set interactive(x) { this.mInteractive = x; },
	get interactive() { return this.mInteractive; },
	set ownerWindow(x) { this.mOwnerWindow = x},
	get ownerWindow() { return this.mOwnerWindow; },

	set statusCode(x) { },
	get statusCode() { return this.mStatus; },
	set channel(x) { },
	get channel() { return this.mChannel; },

	onStartRequest: function(request, ctxt) {
		this.mChannel = request;
		this.mCount = 0;
		if (ctxt)
		{
			this.mOutStream = ctxt.wrappedJSObject.outStream;
			this.mFileStream = ctxt.wrappedJSObject.fileStream;
			this.mInteractive = ctxt.wrappedJSObject.interactive;
		}
	},

	onStopRequest: function(request, ctxt, status) {
		// drop the circular reference
		this.mChannel = null;
		if (status == kNS_OK) {
			try {
				request.QueryInterface(Components.interfaces.nsIHttpChannel);
				if (request.responseStatus == 200) {
					this.mOutStream.flush();
					this.mFileStream.finish();
					this.mStatus = kNS_OK;
					if (this.mInteractive)
					{
						$('label').setAttribute('value',danBundle.GetStringFromName('danbooruUp.msg.done'));
						$('button').setAttribute('label',danBundle.GetStringFromName('danbooruUp.msg.done'));
					}
					return;
				} else if (request.responseStatus == 304) {
					// only happens with If-Modified-By is set, which would be the reltag case
					this.mFileStream.close();
					this.mStatus = kNS_OK;
					if (this.mInteractive) {
						$('label').setAttribute('value',danBundle.GetStringFromName("danbooruUp.msg.relatedUpToDate"));
						$('progress').mode = 'determined';
						$('button').setAttribute('label',danBundle.GetStringFromName('danbooruUp.msg.done'));
					}
					return;
				}
			} catch(e) { __log(e); }
		} else if (status == kErrorAbort) {
			this.mStatus = kErrorFailure;
			this.mFileStream.close();
			if (this.mInteractive) {
				$('label').setAttribute('value',danBundle.GetStringFromName("danbooruUp.msg.readcancel"));
				$('progress').mode = 'determined';
				$('button').setAttribute('label',danBundle.GetStringFromName('danbooruUp.msg.retry'));
			}
			return;
		}
		__log("DanbooruUp download failure " + request.responseStatusText + " " + NameForStatusCode(status));
		this.mStatus = kErrorFailure;
		this.mFileStream.close();
		$('button').setAttribute('label',danBundle.GetStringFromName('danbooruUp.msg.retry'));
	},

	onDataAvailable: function (aRequest, aContext, aInputStream, aOffset, aCount)
	{
		try {
			this.mOutStream.writeFrom(aInputStream, aInputStream.available());
			this.mCount += aCount;
		} catch(e) {
			__log(e);
		}
	},

	onStatus : function(aRequest, aContext, aStatusCode, aStatusArg)
	{
		//if (aStatusCode == kStatusReceivingFrom_Status) return;
		//print("onStatus:");
		//print("  Request: " + aRequest.name);
		//print("  StatusCode: " + NameForStatusCode(aStatusCode));
		//print("  StatusArg: " + aStatusArg);
		if (aStatusCode == this.mStatus) return;
		if (!this.mInteractive) return;
		if (!this.mChannel) this.mChannel = aRequest;
		this.mStatus = aStatusCode;
		var msg = '';
		try {
			aRequest.QueryInterface(Components.interfaces.nsIChannel);
			msg = neckoBundle.formatStringFromName(aStatusCode - kNetBase, [aStatusArg], 1);
		} catch(e) {
			msg = NameForStatusCode(aStatusCode);
		}
		$('label').setAttribute('value', msg);
	},
	onProgress : function(aRequest, aContext, aProgress, aProgressMax)
	{
		if (!this.mInteractive) return;
		$('progress').mode = 'determined';
		if (aProgressMax > 0 && aProgress > 0)
			$('progress').setAttribute('value', aProgress/aProgressMax*100);
		if (aRequest == null && aContext == null)
		{
			$('label').setAttribute('value', danBundle.GetStringFromName('danbooruUp.msg.processing'));
			$('button').disabled = true;
		}
	},
	onChannelRedirect : function(aOldChannel, aNewChannel, aFlags)
	{
		//print("redirect");
	},

	cancel : function()
	{
		this.mCanceled = true;
		if (this.mChannel)
			this.mChannel.cancel(kErrorAbort);
		return !($('button').disabled);
	},

	// nsIDOMEventListener
	handleEvent : function(aEvent)
	{
		switch (aEvent.type)
		{
		case 'load':
			// XHR complete, but we use the observer notifications to tell whether it is successful or not
			break;
		case 'error':
			// XHR is lame and doesn't give us the status code sent with the stoprequest
			if (this.mInteractive)
			{
				$('progress').mode = 'determined';
				if (this.mCanceled)
					$('label').setAttribute('value',danBundle.GetStringFromName('danbooruUp.msg.readcancel'));
				else
					$('label').setAttribute('value',danBundle.GetStringFromName('danbooruUp.err.errorRetrievingTags'));
				$('button').setAttribute('label',danBundle.GetStringFromName('danbooruUp.msg.retry'));
				this.mStatus = kErrorFailure;
			}
			break;
		}
	},

	observe: function(aSubject, aTopic, aData)
	{
		if (!this.mInteractive)
			return;
		switch (aTopic) {
		case "danbooru-update-done":
			aSubject.QueryInterface(Components.interfaces.nsISupportsPRUint32);
			$('label').setAttribute('value', danBundle.formatStringFromName("danbooruUp.opt.updatedNodes", [aSubject.data], 1));
			$('button').disabled = false;
			$('button').setAttribute('label', danBundle.GetStringFromName('danbooruUp.msg.done'));
			this.mStatus = kNS_OK;
			break;
		case "danbooru-update-failed":
			// sent when HTTP response is not 200
			aSubject.QueryInterface(Components.interfaces.nsIXMLHttpRequest);
			$('label').setAttribute('value', aSubject.status + ' ' + aSubject.statusText);
			$('button').setAttribute('label', danBundle.GetStringFromName('danbooruUp.msg.retry'));
			this.mStatus = kErrorFailure;
			break;
		case "danbooru-update-processing-max":
			aSubject.QueryInterface(Components.interfaces.nsISupportsPRUint32);
			this.mNodes = aSubject.data;
			$('progress').mode = 'determined';
			$('progress').setAttribute('value', 0);
			break;
		case "danbooru-update-processing-progress":
			aSubject.QueryInterface(Components.interfaces.nsISupportsPRUint32);
			$('progress').setAttribute('value', aSubject.data/this.mNodes*100);
			__log(aSubject.data);
			break;
		case "danbooru-cleanup-confirm":
			aSubject.QueryInterface(Components.interfaces.nsISupportsPRUint32);
			var hs = Components.classes['@unbuffered.info/danbooru/helper-service;1'].getService(Components.interfaces.danbooruIHelperService);
			if(this.confirm(danBundle.GetStringFromName('danbooruUp.prompt.title'), danBundle.formatStringFromName('danbooruUp.msg.cleanupconfirm', [aSubject.data, hs.tagService.rowCount], 2)))
				obsSvc.notifyObservers(null, 'danbooru-process-tags', null);
			else
				this.mWindow.close();
			break;
		}
	},

	// nsISupports
	QueryInterface : function(aIID)
	{
		if (aIID.equals(Components.interfaces.nsIProgressEventSink)
			|| aIID.equals(Components.interfaces.nsIChannelEventSink)
			|| aIID.equals(Components.interfaces.nsIRequestObserver)
			|| aIID.equals(Components.interfaces.nsIStreamListener)
			|| aIID.equals(Components.interfaces.nsIDOMEventListener)
			|| aIID.equals(Components.interfaces.nsIPrompt)
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
		var array = [Components.interfaces.nsIProgressEventSink,
				Components.interfaces.nsIChannelEventSink,
				Components.interfaces.nsIRequestObserver,
				Components.interfaces.nsIStreamListener,
				Components.interfaces.nsIDOMEventListener,
				Components.interfaces.nsIPrompt,
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

