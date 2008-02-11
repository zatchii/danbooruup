// -*- Mode: javascript; tab-width: 4; indent-tabs-mode: t; -*-
// uploading code, loaded into helper service scope
// in content/ (until 1.9 comes in with C.u.load) because you can't get at component/ through chrome URIs
// vim:set ts=4 sw=4 noet:
var StrBundleSvc	= Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
var danbooruUpMsg	= StrBundleSvc.createBundle('chrome://danbooruup/locale/danbooruUp.properties');
var commondlgMsg	= StrBundleSvc.createBundle('chrome://mozapps/locale/extensions/update.properties');

var cacheService	= Components.classes["@mozilla.org/network/cache-service;1"]
						.getService(Components.interfaces.nsICacheService);
var httpCacheSession = cacheService.createSession("HTTP", 0, true);
httpCacheSession.doomEntriesIfExpired = false;
var ftpCacheSession = cacheService.createSession("FTP", 0, true);
ftpCacheSession.doomEntriesIfExpired = false;

const XPathResult = Components.interfaces.nsIDOMXPathResult;

function getSize(url) {
	try
	{
		var cacheEntryDescriptor = httpCacheSession.openCacheEntry(url, Components.interfaces.nsICache.ACCESS_READ, false);
		if(cacheEntryDescriptor)
			return cacheEntryDescriptor.dataSize;
	}
	catch(ex) {}
	try
	{
		cacheEntryDescriptor = ftpCacheSession.openCacheEntry(url, Components.interfaces.nsICache.ACCESS_READ, false);
		if (cacheEntryDescriptor)
			return cacheEntryDescriptor.dataSize;
	}
	catch(ex) {}
	return -1;
}

function addNotification(aTab, aMessage, aIcon, aPriority, aButtons, aExtra)
{
	var notificationBox = aTab.linkedBrowser.parentNode;
	var notification;
	if (notification = notificationBox.getNotificationWithValue("danbooru-up")) {
		do {
			// need a little more alacrity than removeNotification provides
			notificationBox.removeChild(notification);
			var idx = notificationBox.allNotifications.length - 2;
			if (idx >= 0) {
				notificationBox.currentNotification = notificationBox.allNotifications[idx];
			} else {
				notificationBox.currentNotification = null;
			}
		} while (notification = notificationBox.getNotificationWithValue("danbooru-up"));
	}

	notification = notificationBox.appendNotification(aMessage, "danbooru-up", aIcon, aPriority, aButtons);
	if (notification.boxObject.height >= 200) {
		notification.style.overflow = 'scroll';
		notification.style.height = '200px';
	}
	if (aExtra) {
		if (aExtra.type == 'link')
			addLinkToNotification(notification, aExtra.link);
		else if (aExtra.type == 'progress')
			addProgressToNotification(notification);
	}
	// hide higher priority notifications
	var self = notification;
	notification.close = function danNoteClose() {
		var control = self.control;
		if (control) {
			control.removeNotification(self);
			for (var i=0; i<control.allNotifications.length; i++)
			{
				if (control.allNotifications[i].hidden) control.allNotifications[i].hidden = false;
			}
		} else {
			self.hidden = true;
		}
	}
	notificationBox.currentNotification = notification;
	notificationBox._showNotification(notification, true);
	for (var i=0; i<notificationBox.allNotifications.length; i++)
	{
		if (notificationBox.allNotifications[i] == notification) continue;
		if (!notificationBox.allNotifications[i].hidden) notificationBox.allNotifications[i].hidden = true;
	}
}

// hack to get a clickable link in the browser message
function addLinkToNotification(notification, viewurl)
{
	var msgtext = notification.ownerDocument.getAnonymousElementByAttribute(notification, "anonid", "messageText");
	var link = notification.ownerDocument.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:label");
	link.setAttribute("class", "danboorumsglink");
	link.setAttribute("anonid", "danboorulink");
	link.setAttribute("value", viewurl);
	link.setAttribute("flex", "1");
	link.setAttribute("onclick", "if(!handleLinkClick(event,'" + viewurl + "',this)) loadURI('" + viewurl + "', null, null);");
	msgtext.appendChild(link);
}

function addProgressToNotification(notification)
{
	var msgtext = notification.ownerDocument.getAnonymousElementByAttribute(notification, "anonid", "messageText");
	var meter = notification.ownerDocument.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:progressmeter");
	//debugger;
	meter.setAttribute("class", "danboorumsgprogress");
	meter.setAttribute("anonid", "danbooruprogress");
	meter.mode = 'determined';
	meter.setAttribute("value", "0");
	meter.setAttribute("flex", "1");
	msgtext.appendChild(meter);
}

/*
 * retrieves an image and constructs the multipart POST data
 */
function danbooruUploader(aRealSource, aSource, aTags, aRating, aDest, aTab, aLocal, aLocation, aUpdateTags)
{
	this.mRealSource = aRealSource;
	this.mSource = aSource;
	this.mTags = aTags;
	if(aRating) {
		this.mRating = aRating;
	}
	this.mDest = aDest;
	this.mTab = aTab;
	this.mLocation = aLocation;
	this.mUpdateTags = aUpdateTags;
	//this.mChannel = aChannel;

	this.mStorage = Components.classes["@mozilla.org/storagestream;1"]
			.createInstance(Components.interfaces.nsIStorageStream);
	this.mStorage.init(4096, 64*1048576, null);

	if (aLocal) {
		this.mOutStr = Components.classes["@mozilla.org/binaryoutputstream;1"]
				.createInstance(Components.interfaces.nsIBinaryOutputStream)
				.QueryInterface(Components.interfaces.nsIOutputStream);
		this.mOutStr.setOutputStream(this.mStorage.getOutputStream(0));
	} else {
		this.mOutStr = Components.classes["@mozilla.org/network/buffered-output-stream;1"]
				.createInstance(Components.interfaces.nsIBufferedOutputStream)
				.QueryInterface(Components.interfaces.nsIOutputStream);
		this.mOutStr.init(this.mStorage.getOutputStream(0), 8192);
	}
}

danbooruUploader.prototype = {
	mSource:"",
	mTags:"",
	mTitle:"",
	mRating:"Questionable",
	mDest:"",
	mTab:null,
	mChannel:null,
	mStorage:null,
	mOutStr:null,
	mInStr:null,
	mMimeIS:null,
	mLocation:"",
	mUpdateTags:false,

	upload: function ()
	{
		//var fieldFile	="post[file]";
		//var fieldSource	="post[source_url]";
		//var fieldTags	="post[tags]";
		var upURI = ioService.newURI(this.mDest, 'UTF-8', null);
		var fieldPrefix = "";
		var fieldSuffix = "";

		if (upURI.path.match(/\/post\/create\.xml$/))
		{
			fieldPrefix = "post[";
			fieldSuffix = "]";
		}

		var fieldLogin		= "login";
		var fieldPassHash	= "password_hash";
		var fieldFile		= fieldPrefix + "file" + fieldSuffix;
		var fieldSource		= fieldPrefix + "source" + fieldSuffix;
		var fieldTags		= fieldPrefix + "tags" + fieldSuffix;
		var fieldRating		= fieldPrefix + "rating" + fieldSuffix;
		var fieldMD5		= fieldPrefix + "md5" + fieldSuffix;

		var postDS	= Components.classes["@mozilla.org/io/multiplex-input-stream;1"]
				.createInstance(Components.interfaces.nsIMultiplexInputStream)
				.QueryInterface(Components.interfaces.nsIInputStream);
		var postChunk	= "";
		var endPostChunk	= "";
		var boundary	= "---------------------------" + Math.floor(Math.random()*0xFFFFFFFF)
				+ Math.floor(Math.random()*0xFFFFFFFF) + Math.floor(Math.random()*0xFFFFFFFF);

		// create the file name
		var fn = "danbooruup" + new Date().getTime() + Math.floor(Math.random()*0xFFFFFFFF);
		var conttype = "";
		try {
			var mimeService = Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsIMIMEService);
			var ext = mimeService.getPrimaryExtension(this.mChannel.contentType, null);
			fn += "." + ext;
			conttype = this.mChannel.contentType;
		}catch(e){}

		if(!conttype)
		{
			conttype = "application/octet-stream";
		}

		// MD5
		var hasher = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
		var hashInStr = Components.classes["@mozilla.org/network/buffered-input-stream;1"]
			.createInstance(Components.interfaces.nsIBufferedInputStream);
		hashInStr.init(this.mStorage.newInputStream(0), 8192);
		hasher.init(hasher.MD5);
		hasher.updateFromStream(hashInStr, 0xFFFFFFFF); /* PR_UINT32_MAX */
		var outMD5 = hasher.finish(false);
		var outMD5Hex = [ ('0'+outMD5.charCodeAt(c).toString(16)).slice(-2) for(c in outMD5) ].join('');

		try {
		var prefBranch = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
		if (prefBranch.getBoolPref("extensions.danbooruUp.checkMD5BeforeUpload") && upURI.path.match(/\/post\/create\.xml$/))
		{
			var xhr = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
			this.mQueryRequest = xhr;
			var postIndexURI = upURI.clone().QueryInterface(Components.interfaces.nsIURL);
			postIndexURI.path = postIndexURI.path.replace(/\/create\.xml$/, '/index.xml');
			postIndexURI.query = "tags=md5%3A" + outMD5Hex;
			xhr.open("GET", postIndexURI.spec, true);
			xhr.overrideMimeType("text/xml");
			xhr.QueryInterface(Components.interfaces.nsIJSXMLHttpRequest);
			this.mDuplicate = null;
			this.mDuplicateID = null;

			var self = this;
			function notifyDuplicate() {
				var str = danbooruUpMsg.GetStringFromName("danbooruUp.err.duplicate");
				var postShowURI = upURI.clone();
				postShowURI.path = postShowURI.path.replace(/\/create\.xml$/, '/show/'+self.mDuplicateID);
				postShowURI.QueryInterface(Components.interfaces.nsIURL);
				postShowURI.query = '';
				addNotification(self.mTab, str, "chrome://danbooruup/skin/danbooru-attention.gif",
								self.mTab.linkedBrowser.parentNode.PRIORITY_WARNING_MEDIUM, null, {type:'link', link:postShowURI.spec});
				self.mDuplicate = true;
				self.mQueryRequest = null;
			}
			function changeLoad(event) {
				// changing tags on duplicate can fail silently since I am lazy
				notifyDuplicate();
			}
			function queryError(event) {
				self.mDuplicate = false;
				self.mQueryRequest = null;
			}
			function queryLoad(event) {
				var responseXML = xhr.responseXML;
				if (responseXML && responseXML.documentElement.namespaceURI != "http://www.mozilla.org/newlayout/xml/parsererror.xml" &&
					(xhr.status == 200 || xhr.status == 0)) {
					var result = responseXML.evaluate("/posts/post", responseXML, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
					if (result.snapshotLength) {
						// got a response post
						self.mDuplicateID = result.snapshotItem(0).getAttribute('id');

						if (prefBranch.getBoolPref("extensions.danbooruUp.updateTagsOnDuplicate")) {
							var param = 'id=' + result.snapshotItem(0).getAttribute('id') + '&post[tags]=' + encodeURIComponent(result.snapshotItem(0).getAttribute("tags") + ' ' + self.mTags);
							var postUpdateURI = upURI.clone();
							postUpdateURI.path = postUpdateURI.path.replace(/\/create\.xml$/, '/update.xml');
							postUpdateURI.QueryInterface(Components.interfaces.nsIURL);
							postUpdateURI.query = '';
							var uxhr = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
							this.mQueryRequest = uxhr;
							uxhr.open("POST", postUpdateURI.spec, true);
							uxhr.overrideMimeType("text/xml");
							uxhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
							uxhr.setRequestHeader("Content-Length", param.length);
							uxhr.setRequestHeader("Connection", "close");

							uxhr.QueryInterface(Components.interfaces.nsIJSXMLHttpRequest);
							uxhr.onload = changeLoad;
							uxhr.onerror = queryError;

							uxhr.send(param);
						} else {
							notifyDuplicate();
						}
						return;
					}
				}
				self.mDuplicate = false;
				self.mQueryRequest = null;
			}

			xhr.onload = queryLoad;
			xhr.onerror = queryError;

			var buttons = [{
					 label: commondlgMsg.GetStringFromName('cancelButtonText'),
					 accessKey: commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'),
					 popup: null,
					 callback: danbooruUpHitch(this, "cancel")
			}];

			addNotification(this.mTab, danbooruUpMsg.GetStringFromName('danbooruUp.msg.checking'),
					"chrome://danbooruup/skin/Throbber-small.gif",
					this.mTab.linkedBrowser.parentNode.PRIORITY_INFO_MEDIUM, buttons);

			xhr.send(null);
		}
		} catch (e) { }

		// cookie info
		/*
		try {
			var cookieJar	= Components.classes["@mozilla.org/cookieService;1"]
					.getService(Components.interfaces.nsICookieService);
			var cookieStr	= cookieJar.getCookieString(upURI, null);
			var loginM	= cookieStr.match(/(?:;\s*)?login=(\w+)(?:;|$)/);
			var passM	= cookieStr.match(/(?:;\s*)?pass_hash=([0-9A-Fa-f]+)(?:;|$)/);

			if(loginM && passM) {
				postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldLogin
					+ "\"\r\n\r\n" + loginM[1] + "\r\n";
				postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldPassHash
					+ "\"\r\n\r\n" + passM[1] + "\r\n";
			}
		} catch(e) {
			// can anything even blow up?
		}
		*/
		// Source field
		postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldSource
			+ "\"\r\n\r\n" + /*encodeURIComponent*/(this.mSource) + "\r\n";

		// thanks to http://aaiddennium.online.lt/tools/js-tool-symbols-entities-symbols.html for
		// pointing out what turned out to be obvious
		var toEnts = function(sText) {
			var sNewText = ""; var iLen = sText.length;
			for (i=0; i<iLen; i++) {
				iCode = sText.charCodeAt(i); sNewText += (iCode > 255 ? "&#" + iCode + ";": sText.charAt(i));
			}
			return sNewText;
		}

		postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldRating
			+ "\"\r\n\r\n" + this.mRating + "\r\n";

		postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldMD5
			+ "\"\r\n\r\n" + outMD5Hex + "\r\n";

		postChunk += "--" + boundary + "\r\n" +
			"Content-Transfer-Encoding: binary\r\n"+
			"Content-Disposition: form-data; name=\"" + fieldFile + "\"; filename=\"" + fn + "\"\r\n"+
			"Content-Type: " + conttype + "\r\n\r\n";

		// the beginning -- text fields
		var strIS = Components.classes["@mozilla.org/io/string-input-stream;1"]
					.createInstance(Components.interfaces.nsIStringInputStream);
		strIS.setData(postChunk, -1);
		postDS.appendStream(strIS);

		// the middle -- binary data
		this.mInStr.init(this.mStorage.newInputStream(0), 8192);
		postDS.appendStream(this.mInStr);

		// the end
		var endIS = Components.classes["@mozilla.org/io/string-input-stream;1"]
					.createInstance(Components.interfaces.nsIStringInputStream);

		// required Tags field goes at the end
		endPostChunk = "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldTags
			+ "\"\r\n\r\n" + /*encodeURIComponent*/(this.mTags) + "\r\n";

		endPostChunk += "\r\n--" + boundary + "--\r\n";

		endIS.setData(endPostChunk, -1);
		postDS.appendStream(endIS);

		// turn it into a MIME stream
		this.mMimeIS = Components.classes["@mozilla.org/network/mime-input-stream;1"]
					.createInstance(Components.interfaces.nsIMIMEInputStream);
		this.mMimeIS.addHeader("Content-Type", "multipart/form-data; boundary="+ boundary, false);
		//mimeIS.addHeader("Cookie", cookieStr, false);

		this.mMimeIS.addContentLength = true;
		this.mMimeIS.setData(postDS);

		// post

		if (this.mQueryRequest)
		{
			this.mTab.linkedBrowser.contentWindow
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
					.getInterface(Components.interfaces.nsIWebNavigation)
				.QueryInterface(Components.interfaces.nsIDocShellTreeItem)
					.rootTreeItem
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
					.getInterface(Components.interfaces.nsIDOMWindow)
				.setTimeout(danbooruUpHitch(this, "waitForMD5Query"), 500);
		} else {
			this.doPost();
		}
	},
	waitForMD5Query:function()
	{
		while (this.mDuplicate === null)
		{
			this.mTab.linkedBrowser.contentWindow
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
					.getInterface(Components.interfaces.nsIWebNavigation)
				.QueryInterface(Components.interfaces.nsIDocShellTreeItem)
					.rootTreeItem
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
					.getInterface(Components.interfaces.nsIDOMWindow)
				.setTimeout(danbooruUpHitch(this, "waitForMD5Query"), 500);
			return;
		}
		if (!this.mDuplicate)
			this.doPost();
	},
	doPost:function()
	{
		var postage = new danbooruPoster();
		var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		os.addObserver(postage, "danbooru-up", false);
		postage.start(this.mMimeIS, this.mRealSource, this.mDest, this.mTab, this.mUpdateTags);
	},
	cancel:function()
	{
		this.mDuplicate = true;
		if(this.mQueryRequest)
		{
			this.mQueryRequest.abort();
			this.mQueryRequest = null;
			return false;
		}
		try{
			if(this.mChannel)
			{
				var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
				this.mChannel.cancel(kErrorAbort);
				try { os.removeObserver(this, "danbooru-down"); } catch(ex) {}

				addNotification(this.mTab, danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploadcancel'),
						"chrome://danbooruup/skin/Throbber-small.png",
						this.mTab.linkedBrowser.parentNode.PRIORITY_INFO_MEDIUM, null);

				return true;
			}
		}catch(e){
			if(e == Components.results.NS_ERROR_XPC_JAVASCRIPT_ERROR_WITH_DETAILS)
				alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.exc') + e.message);
			else
				alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.exc') + e);
		}
		return false;
	},
	onDataAvailable: function (channel, ctxt, inStr, sourceOffset, count)
	{
		try{
			var bis = Components.classes["@mozilla.org/binaryinputstream;1"]
				.createInstance(Components.interfaces.nsIBinaryInputStream);
			bis.setInputStream(inStr);

			this.mOutStr.writeByteArray(bis.readByteArray(count), count);
		}catch(e){alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.read')+e);}
	},
	onStartRequest: function (channel, ctxt)
	{
		channel.QueryInterface(Components.interfaces.nsIChannel);
		if( channel.contentType && channel.contentType.substring(0, 6) != "image/" ) {
			alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.notimage'));
			throw Components.results.NS_ERROR_UNEXPECTED;
		}

		this.mChannel = channel;

		/*
		var notificationBox = this.mTab.linkedBrowser.parentNode;
		var notification = notificationBox.getNotificationWithValue("danbooru-up");
		if (notification) {
			notificationBox.removeNotification(notification);
		}
		*/
		var buttons = [{
				 label: commondlgMsg.GetStringFromName('cancelButtonText'),
				 accessKey: commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'),
				 popup: null,
				 callback: danbooruUpHitch(this, "cancel")
		}];
		/*
		//const priority = notificationBox.PRIORITY_WARNING_MEDIUM;
		var priority = notificationBox.PRIORITY_INFO_MEDIUM;
		notificationBox.appendNotification(danbooruUpMsg.GetStringFromName('danbooruUp.msg.reading')+ " "+this.mRealSource.spec,
				"danbooru-up",
				"chrome://global/skin/throbber/Throbber-small.gif",
				priority, buttons);
		*/
		addNotification(this.mTab, danbooruUpMsg.GetStringFromName('danbooruUp.msg.reading')+ " "+this.mRealSource.spec,
				"chrome://danbooruup/skin/Throbber-small.gif",
				this.mTab.linkedBrowser.parentNode.PRIORITY_INFO_MEDIUM, buttons);
	},
	onStopRequest: function (channel, ctxt, status)
	{
		switch(status){
			case Components.results.NS_OK:
				try {
					this.mOutStr.close();
					this.mInStr = Components.classes["@mozilla.org/network/buffered-input-stream;1"]
						.createInstance(Components.interfaces.nsIBufferedInputStream);
					var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
					try { os.removeObserver(this, "danbooru-down"); } catch (ex) {}
					this.upload();
				}catch(e){alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.readstop') + e);}
				break;
			default:
				alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.exc')+'.'+status.toString(16));
				break;
			case Components.results.NS_ERROR_UNEXPECTED:	// usually not an image
			case 0x804B0020:	// connection reset
				alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.exc')+'!!'+status.toString(16));
				break;
			case 0x804B0002:	// manually canceled
		}
	},
	observe: function (aSubject, aTopic, aData)
	{
		switch (aTopic) {
			case "danbooru-down":
				if(this.mTab == this.mTab.linkedBrowser.getTabBrowser().selectedTab)
					this.cancel();
		}
	}
};


/*
 *
 * performs the actual action given POST data
 *
 */
function danbooruPoster()
{
	this.mStorage = Components.classes["@mozilla.org/storagestream;1"]
			.createInstance(Components.interfaces.nsIStorageStream);
	this.mStorage.init(4096, 131072, null);

	this.mOutStr = Components.classes["@mozilla.org/binaryoutputstream;1"]
			.createInstance(Components.interfaces.nsIBinaryOutputStream)
			.QueryInterface(Components.interfaces.nsIOutputStream);
	this.mOutStr.setOutputStream(this.mStorage.getOutputStream(0));
}

danbooruPoster.prototype = {
	mChannel:null,
	mTab:null,
	mLocation:"",
	mUpURIStr:"",
	mImgURI:null,
	mStorage:null,
	mDataStr:null,
	mOutStr:null,
	mUpdateTags:false,

	start: function (aDatastream, aImgURI, aUpURIStr, aTab, aUpdateTags) {
		// save everything for retry
		this.mUpdateTags = aUpdateTags;
		this.mDataStr = aDatastream;
		this.mUpURIStr = aUpURIStr;
		this.mImgURI = aImgURI;
		// upload URI and cookie info
		this.mChannel = ioService.newChannel(aUpURIStr, "", null)
						.QueryInterface(Components.interfaces.nsIRequest)
						.QueryInterface(Components.interfaces.nsIHttpChannel)
						.QueryInterface(Components.interfaces.nsIUploadChannel);
		this.mChannel.setUploadStream(aDatastream, null, -1);
		this.mChannel.requestMethod = "POST";
		this.mChannel.setRequestHeader("X-Danbooru", "no-redirect", false);
		this.mChannel.allowPipelining = false;

		this.mTab = aTab;
		this.mLocation = aTab.linkedBrowser.contentDocument.location;
		var size = getSize(aImgURI.spec);
		var kbSize = Math.round((size/1024)*100)/100;

		var buttons = [{
			label: commondlgMsg.GetStringFromName('cancelButtonText'),
			accessKey: commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'),
			popup: null,
			callback: danbooruUpHitch(this, "cancel")
		}];
		addNotification(this.mTab,
				danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploading')+' '+aImgURI.spec+
				((size != -1) ?(' ('+kbSize+' KB)') : ''),
				"chrome://danbooruup/skin/Throbber-small.gif",
				this.mTab.linkedBrowser.parentNode.PRIORITY_INFO_MEDIUM, buttons, {type:'progress'});

		// upload progress callback object
		var callback = new Object;
		callback._meter = null;
		callback.onStatus = function(aRequest, aContext, aStatus) {}
		callback.onProgress = function(aRequest, aContext, aProgress, aProgressMax) {
			if (aProgressMax > 0 && aProgress > 0)
			{
				// references to notifications and the progressmeter element within go stale between
				// the time they are gotten/created and the time this function is first called
				if (!this._meter)
				{
					var notification = aTab.linkedBrowser.parentNode.getNotificationWithValue("danbooru-up");
					this._meter = notification.ownerDocument.getAnonymousElementByAttribute(notification, "anonid", "danbooruprogress");
				}
				if (this._meter)
					this._meter.value = aProgress/aProgressMax*100;
			}
		}
		callback.QueryInterface = function(aIID) {
			if (aIID.equals(Components.interfaces.nsIProgressEventSink) ||
					aIID.equals(Components.interfaces.nsIPrompt) ||
					aIID.equals(Components.interfaces.nsIInterfaceRequestor) ||
					aIID.equals(Components.interfaces.nsISupports))
				return this;
			throw Components.results.NS_NOINTERFACE;
		}
		callback.getInterface = function(aIID)	{
			return this.QueryInterface(aIID);
		}
		callback.wrappedJSObject = callback;

		AddDanbooruPromptWrapper(callback);
		callback.mInteractive = true;

		this.mChannel.notificationCallbacks = callback;

		try{
			this.mChannel.asyncOpen(this, null);
			return true;
		} catch(e) {
			alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.post')+e);
		}
		return false;
	},

	cancel: function()
	{
		if(this.mChannel)
		{
			var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
			this.mChannel.cancel(kErrorAbort);
			try { os.removeObserver(this, "danbooru-up"); } catch(e) {}

			var buttons = [{
					 label: danbooruUpMsg.GetStringFromName('danbooruUp.msg.retry'),
					 accessKey: danbooruUpMsg.GetStringFromName('danbooruUp.msg.retry.accessKey'),
					 popup: null,
					 callback: danbooruUpHitch(this, "retry")
			}];
			addNotification(this.mTab,
					danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploadcancel'),
					"chrome://danbooruup/skin/icon.ico",
					this.mTab.linkedBrowser.parentNode.PRIORITY_WARNING_MEDIUM, buttons);
			return false;
		}
		return true;
	},
	retry: function()
	{
		this.mDataStr.QueryInterface(Components.interfaces.nsISeekableStream);
		this.mDataStr.seek(0, 0);
		this.start(this.mDataStr, this.mImgURI, this.mUpURIStr, this.mTab, this.mUpdateTags);
	},

	onDataAvailable: function (aRequest, aContext, aInputStream, aOffset, aCount)
	{
		try {
			aRequest.QueryInterface(Components.interfaces.nsIHttpChannel);
			var bis = Components.classes["@mozilla.org/binaryinputstream;1"]
				.createInstance(Components.interfaces.nsIBinaryInputStream);
			bis.setInputStream(aInputStream);
			this.mOutStr.writeByteArray(bis.readByteArray(aCount), aCount);
		} catch(e) {
			alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.read')+e);
		}
	},
	onStartRequest: function (channel, ctxt)
	{
		//channel.QueryInterface(Components.interfaces.nsIHttpChannel);
		//alert(channel.getResponseHeader("X-Danbooru-Errors")+"\n"+channel.getResponseHeader("X-Danbooru-View-Url"));
	},
	onStopRequest: function (channel, ctxt, status)
	{
		var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		try { os.removeObserver(this, "danbooru-up"); } catch(e) {}

		channel.QueryInterface(Components.interfaces.nsIHttpChannel);

		this.mOutStr.close();

		var errs="";
		var viewurl="";
		var str="";
		var success=false;

		var buttons = [{
				 label: danbooruUpMsg.GetStringFromName('danbooruUp.msg.retry'),
				 accessKey: danbooruUpMsg.GetStringFromName('danbooruUp.msg.retry.accessKey'),
				 popup: null,
				 callback: danbooruUpHitch(this, "retry")
		}];

		if(status == Components.results.NS_OK)
		{
			var contentType="";
			try { contentType = channel.getResponseHeader("Content-Type"); } catch(e) {}

			// danbooru 1.3 post/upload doesn't use HTTP status codes
			if(contentType.match(/^application\/xml(;|$)/)) {
				var sis = this.mStorage.newInputStream(0);
				var bis = Components.classes["@mozilla.org/binaryinputstream;1"]
					.createInstance(Components.interfaces.nsIBinaryInputStream);
				bis.setInputStream(sis);
				str = bis.readBytes(sis.available());

				var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"].createInstance(Components.interfaces.nsIDOMParser);
				var doc = parser.parseFromString(str, "application/xml");

				// <response> tag with children
				if (doc.evaluate("/response/success", doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) {
					viewurl = doc.evaluate("/response/location/text()", doc, null, XPathResult.STRING_TYPE, null).stringValue;
					errs = doc.evaluate("/response/reason/text()", doc, null, XPathResult.STRING_TYPE, null).stringValue;
					success = doc.evaluate("/response/success/text()", doc, null, XPathResult.STRING_TYPE, null).stringValue == "true";
				} else {
					// <response> tag with attributes
					viewurl = doc.evaluate("/response/@location", doc, null, XPathResult.STRING_TYPE, null).stringValue;
					errs = doc.evaluate("/response/@reason", doc, null, XPathResult.STRING_TYPE, null).stringValue;
					success = doc.evaluate("/response/@success", doc, null, XPathResult.STRING_TYPE, null).stringValue == "true";
				}

				if(success) {
					addNotification(this.mTab,
							danbooruUpMsg.GetStringFromName("danbooruUp.msg.uploaded"),
							"chrome://danbooruup/skin/icon.ico",
							this.mTab.linkedBrowser.parentNode.PRIORITY_INFO_MEDIUM, null, {type:'link', link:viewurl});
				} else {
					if(errs == "duplicate")	{
						str = danbooruUpMsg.GetStringFromName("danbooruUp.err.duplicate");
					} else if(errs == "md5 mismatch") {
						str = danbooruUpMsg.GetStringFromName("danbooruUp.err.corruptupload");
					} else if(errs == "access denied") {
						str = danbooruUpMsg.GetStringFromName("danbooruUp.err.accessdenied");
					} else if(errs == "daily limit exceeded") {
						str = danbooruUpMsg.GetStringFromName("danbooruUp.err.limitexceeded");
					} else {
						str = danbooruUpMsg.GetStringFromName("danbooruUp.err.unhandled") + " " + errs;
					}
					addNotification(this.mTab, str, "chrome://danbooruup/skin/danbooru-attention.gif",
							this.mTab.linkedBrowser.parentNode.PRIORITY_WARNING_MEDIUM, null, {type:'link', link:viewurl});
				}
				return;
			}

			// api/add_post route
			if(channel.responseStatus == 200 || channel.responseStatus == 201)
			{
				try { errs = channel.getResponseHeader("X-Danbooru-Errors"); } catch(e) {}
				try { viewurl = channel.getResponseHeader("X-Danbooru-Location"); } catch(e) {}

				if (errs) {
					addNotification(this.mTab,
							danbooruUpMsg.GetStringFromName('danbooruUp.err.unexpected') + ' ' + errs,
							"chrome://danbooruup/skin/danbooru-attention.gif",
							this.mTab.linkedBrowser.parentNode.PRIORITY_INFO_MEDIUM, null);
				} else {
					addNotification(this.mTab,
							danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploaded'),
							"chrome://danbooruup/skin/icon.ico",
							this.mTab.linkedBrowser.parentNode.PRIORITY_INFO_MEDIUM, null, {type:'link', link:viewurl});

					if (this.mUpdateTags)
						os.notifyObservers(null, "danbooru-update", "");
				}
			} else if (channel.responseStatus == 409) {
				try { errs = channel.getResponseHeader("X-Danbooru-Errors"); } catch(e) {}
				try { viewurl = channel.getResponseHeader("X-Danbooru-Location"); } catch(e) {}

				if (errs.search("(^|;)duplicate(;|$)") != -1) {
					str = danbooruUpMsg.GetStringFromName('danbooruUp.err.duplicate');
				} else if (errs.search("(^|;)mismatched md5(;|$)") != -1) {
					str = danbooruUpMsg.GetStringFromName('danbooruUp.err.corruptupload');
				} else {
					str = danbooruUpMsg.GetStringFromName('danbooruUp.err.unhandled') + ' ' + errs;
				}

				addNotification(this.mTab, str, "chrome://danbooruup/skin/danbooru-attention.gif",
						this.mTab.linkedBrowser.parentNode.PRIORITY_WARNING_MEDIUM, null, {type:'link', link:viewurl});
			} else {
				var str = "";
				try {
					var sis = this.mStorage.newInputStream(0);
					var bis = Components.classes["@mozilla.org/binaryinputstream;1"]
						.createInstance(Components.interfaces.nsIBinaryInputStream);
					bis.setInputStream(sis);
					str=bis.readBytes(sis.available());
				} catch (e) {
					if( e.result != Components.results.NS_ERROR_ILLEGAL_VALUE )
					{
						// not a no-data case (actual failure is seeking to position 0
						// when there is nothing there),
						alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.poststop')+e);
						return;
					}
				}

				// plain 500 server errors and the like
				if(!str)
				{
					str = channel.responseStatus + ' ' + channel.responseStatusText;
				}

				// FIXME: newlines do not work in any fashion
				addNotification(this.mTab,
						str, "chrome://danbooruup/skin/danbooru-attention.gif",
						this.mTab.linkedBrowser.parentNode.PRIORITY_WARNING_MEDIUM, buttons);

				if (sis)
				{
					bis.close();
					sis.close();
				}
			}
		} else if (status == kNetTimeout || status == kConnectionRefused || status == kNetReset) {
			var errmsg = StrBundleSvc.createBundle('chrome://global/locale/appstrings.properties');

			if (status == kNetTimeout)
				str = errmsg.formatStringFromName('netTimeout', [channel.URI.spec], 1)
			else if (status == kConnectionRefused || status == kNetReset)
				str = errmsg.formatStringFromName('connectionFailure', [channel.URI.spec], 1)

			addNotification(this.mTab,
					danbooruUpMsg.GetStringFromName('danbooruUp.err.neterr') + ' ' + str,
					"chrome://danbooruup/skin/danbooru-attention.gif",
					this.mTab.linkedBrowser.parentNode.PRIORITY_WARNING_MEDIUM, buttons);

		} else if (status == kErrorAbort) { // user cancel, no further action needed
		} else { // not NS_OK
			alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.poststop')+status.toString(16));
		}
		return;
	},
	observe: function (aSubject, aTopic, aData)
	{
		switch (aTopic) {
		case "danbooru-up":
			if(this.mTab == this.mTab.linkedBrowser.getTabBrowser().selectedTab)
				this.cancel();
		}
	}
};
