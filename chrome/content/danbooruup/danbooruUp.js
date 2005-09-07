// vim: set ts=8 sw=8 noet :
var danbooruImgNode	= null;
var StrBundleSvc	= Components.classes['@mozilla.org/intl/stringbundle;1']
			.getService(Components.interfaces.nsIStringBundleService);
var cacheService	= Components.classes["@mozilla.org/network/cache-service;1"]
			.getService(Components.interfaces.nsICacheService);
var prefService		= Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefBranch);
var ioService		= Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);

var danbooruUpMsg	= StrBundleSvc.createBundle('chrome://danbooruup/locale/danbooruUp.properties');
var commondlgMsg	= StrBundleSvc.createBundle('chrome://mozapps/locale/extensions/update.properties');

var httpCacheSession = cacheService.createSession("HTTP", 0, true);
httpCacheSession.doomEntriesIfExpired = false;
var ftpCacheSession = cacheService.createSession("FTP", 0, true);
ftpCacheSession.doomEntriesIfExpired = false;

var tagService;
try {
	tagService = Components.classes["@mozilla.org/danbooru/taghistory-service;1"]
			.getService(Components.interfaces.nsIDanbooruTagHistoryService);
} catch(x) {
	var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			.getService(Components.interfaces.nsIPromptService);
	promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.component'));
}

var danbooruTagUpdater = {
	mMaxID:-1,
	mTimer:null,

	getMaxID: function()
	{
		try {
			return tagService.maxID;
		} catch(e) {
			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
					.getService(Components.interfaces.nsIPromptService);
			promptService.alert(null, danbooruUpMsg.GetStringFromName('danbooruUp.err.title'), danbooruUpMsg.GetStringFromName('danbooruUp.err.maxid'));
		}
		return 0;
	},
	observe: function(aS, aT, aD)
	{
		//var os	= Components.classes["@mozilla.org/observer-service;1"]
		//	.getService(Components.interfaces.nsIObserverService);
		//os.removeObserver(this, "browser-window-before-show");
		switch (aT) {
		case 'danbooru-update':
			this.update(aD == "full");
			break;
		case 'danbooru-options-changed':
			this.startTimer();
			break;
		}
	},
	startTimer: function()
	{
		if (this.mTimer)
			this.mTimer.cancel();
		if (!prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.ontimer"))
			return;
		this.mTimer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
		this.mTimer.initWithCallback(this, prefService.getIntPref("extensions.danbooruUp.autocomplete.update.interval")*60*1000, this.mTimer.TYPE_REPEATING_SLACK);
	},
	startupUpdate: function()
	{
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
		this.update(full);
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
		this.update(false);
	},
	update: function(aFull)
	{
		var locationURL	= ioService.newURI(prefService.getCharPref("extensions.danbooruUp.updateuri"), '', null)
				.QueryInterface(Components.interfaces.nsIURL);
		if(this.mMaxID>0 && !aFull)
		{
			locationURL.query = "after="+(this.mMaxID+1);
		}
		tagService.updateTagListFromURI(locationURL.spec);
		this.mMaxID = this.getMaxID();
		prefService.setIntPref("extensions.danbooruUp.autocomplete.update.lastupdate", Date.now());

		if (prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.ontimer") && !this.mTimer)
		{
			this.startTimer();
		}
	}
};

function danbooruImageInit(e) {
	var menu = document.getElementById("contentAreaContextMenu");
	menu.addEventListener("popupshowing",danbooruImageContext,false);
	menu.addEventListener("onpopupshowing",danbooruImageContext,false);
	return;
}

function danbooruImageContext(e) {
	document.getElementById("danbooru-image").hidden = true;
	if( gContextMenu.onImage ) {
		document.getElementById("danbooru-image").hidden = false;
	}
	danbooruImgNode = gContextMenu.target;
	return;
}

function danbooruUploadImage() {
	var imgURIStr	= danbooruImgNode.getAttribute("src");

	//var thistab	= getBrowser().selectedBrowser;
	var browser	= getBrowser();
	var thistab	= browser.getBrowserForTab(browser.selectedTab);

	var locationURI	= ioService.newURI(danbooruImgNode.ownerDocument.location,
					danbooruImgNode.ownerDocument.characterSet, null);
	var imgURI = ioService.newURI(imgURIStr, danbooruImgNode.ownerDocument.characterSet, locationURI);

	// update synchronously
	try {
		if(prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.beforedialog"))
			danbooruTagUpdater.update(false);
	} catch (e) {
	}

	// dialog=yes raises asserts that I don't feel like ignoring all the time using a debug build
	window.openDialog("chrome://danbooruup/content/danbooruUpBox.xul",
		"danbooruUpBox", "centerscreen,chrome,dialog=no,resizable=yes",
		{imageNode:danbooruImgNode, imageURI:imgURI, wind:thistab, start:danbooruStartUpload});
}

function danbooruStartUpload(aRealSource, aSource, aTags, aTitle, aDest, aNode, aWind, aUpdate)
{
	var uploader;
	var imgChannel	= ioService.newChannelFromURI(aRealSource);
	var os		= Components.classes["@mozilla.org/observer-service;1"]
			.getService(Components.interfaces.nsIObserverService);

	if (aRealSource.scheme == "file") {
		imgChannel = imgChannel.QueryInterface(Components.interfaces.nsIFileChannel);
		uploader = new danbooruUploader(aRealSource, aSource, aTags, aTitle, aDest, aWind, true, aWind.contentDocument.location, aUpdate);
		// add entry to the observer
		os.addObserver(uploader, "danbooru-down", false);
		imgChannel.asyncOpen(uploader, imgChannel);
	} else {
		var cookieJar	= Components.classes["@mozilla.org/cookieService;1"]
				.getService(Components.interfaces.nsICookieService);
		var cookieStr = cookieJar.getCookieString(ioService.newURI(aNode.ownerDocument.location, "", null), null);

		imgChannel = imgChannel.QueryInterface(Components.interfaces.nsIHttpChannel);
		imgChannel.referrer = ioService.newURI(aNode.ownerDocument.location, "", null);
		imgChannel.setRequestHeader("Cookie", cookieStr, true);

		// don't need to bother with Uploader's array transfer
		var listener = Components.classes["@mozilla.org/network/simple-stream-listener;1"]
				.createInstance(Components.interfaces.nsISimpleStreamListener);
		uploader = new danbooruUploader(aRealSource, aSource, aTags, aTitle, aDest, aWind, false, aWind.contentDocument.location, aUpdate);

		// add entry to the observer
		os.addObserver(uploader, "danbooru-down", false);
		listener.init(uploader.mOutStr, uploader);
		imgChannel.asyncOpen(listener, imgChannel);
	}
}

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


/*
 * retrieves an image and constructs the multipart POST data
 */
function danbooruUploader(aRealSource, aSource, aTags, aTitle, aDest, aTab, aLocal, aLocation, aUpdateTags)
{
	this.mRealSource = aRealSource;
	this.mSource = aSource;
	this.mTags = aTags;
	this.mTitle = aTitle;
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
mDest:"",
mTab:null,
mChannel:null,
mStorage:null,
mOutStr:null,
mInStr:null,
mLocation:"",
mUpdateTags:false,

upload: function ()
{
	//var fieldFile	="post[file]";
	//var fieldSource	="post[source_url]";
	//var fieldTags	="post[tags]";
	//var fieldTitle	="post[title]";
	var fieldLogin		= "login";
	var fieldPassHash	= "password_hash";
	var fieldFile		= "file";
	var fieldSource		= "source";
	var fieldTitle		= "title";
	var fieldTags		= "tags";

	var postDS	= Components.classes["@mozilla.org/io/multiplex-input-stream;1"]
			.createInstance(Components.interfaces.nsIMultiplexInputStream)
			.QueryInterface(Components.interfaces.nsIInputStream);
	var postChunk	= "";
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

	// upload URI and cookie info
	var upURI = ioService.newURI(this.mDest, null, null);

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
	// Source field
	postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldSource
		+ "\"\r\n\r\n" + /*encodeURIComponent*/(this.mSource) + "\r\n";
	// Tags field
	postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldTags
		+ "\"\r\n\r\n" + /*encodeURIComponent*/(this.mTags) + "\r\n";

	// thanks to http://aaiddennium.online.lt/tools/js-tool-symbols-entities-symbols.html for
	// pointing out what turned out to be obvious
	var toEnts = function(sText) { var sNewText = ""; var iLen = sText.length; for (i=0; i<iLen; i++) { iCode = sText.charCodeAt(i); sNewText += (iCode > 255 ? "&#" + iCode + ";": sText.charAt(i)); } return sNewText; }

	postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldTitle
		+ "\"\r\n\r\n" + toEnts(this.mTitle) + "\r\n";

	postChunk += "--" + boundary + "\r\n" +
		"Content-Transfer-Encoding: binary\r\n"+
		"Content-Disposition: form-data; name=\"" + fieldFile + "\"; filename=\"" + fn + "\"\r\n"+
		"Content-Type: " + conttype + "\r\n\r\n";

	// the beginning
	var strIS = Components.classes["@mozilla.org/io/string-input-stream;1"]
		.createInstance(Components.interfaces.nsIStringInputStream);
	strIS.setData(postChunk, -1);
	postDS.appendStream(strIS);

	// the middle
	this.mInStr.init(this.mStorage.newInputStream(0), 8192);
	postDS.appendStream(this.mInStr);

	// the end
	var endIS = Components.classes["@mozilla.org/io/string-input-stream;1"]
		.createInstance(Components.interfaces.nsIStringInputStream);
	endIS.setData("\r\n--" + boundary + "--\r\n", -1);
	postDS.appendStream(endIS);

	// turn it into a MIME stream
	var mimeIS = Components.classes["@mozilla.org/network/mime-input-stream;1"]
			.createInstance(Components.interfaces.nsIMIMEInputStream);
	mimeIS.addHeader("Content-Type", "multipart/form-data; boundary="+ boundary, false);
	//mimeIS.addHeader("Cookie", cookieStr, false);

	mimeIS.addContentLength = true;
	mimeIS.setData(postDS);

	// post

	var postage = new danbooruPoster();
	var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
	os.addObserver(postage, "danbooru-up", false);
	postage.start(mimeIS, this.mRealSource, this.mDest, this.mTab, this.mUpdateTags);
},
cancel:function()
{
	try{
	if(this.mChannel)
	{
		var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		this.mChannel.cancel(0x804b0002);
		os.removeObserver(this, "danbooru-down");
		if(getBrowser().getMessageForBrowser(this.mTab, 'top'))
			getBrowser().showMessage(this.mTab, "chrome://global/skin/throbber/Throbber-small.png",
				danbooruUpMsg.GetStringFromName('danbooruUp.msg.readcancel'), "",
				"", "danbooru-up", null, "top", true, "");
		return true;
	}
	}catch(e){alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.exc') + e);}
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
	if(getBrowser().getMessageForBrowser(this.mTab, 'top'))
		getBrowser().showMessage(this.mTab, "chrome://global/skin/throbber/Throbber-small.gif",
			danbooruUpMsg.GetStringFromName('danbooruUp.msg.reading')+ " "+this.mRealSource.spec,
			commondlgMsg.GetStringFromName('cancelButtonText'),
			null, "danbooru-down", null, "top", true, commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'));
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
		os.removeObserver(this, "danbooru-down");
		this.upload();
		}catch(e){alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.readstop') + e);}
		break;
	default:
		alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.exc')+status.toString(16));
		break;
	case Components.results.NS_ERROR_UNEXPECTED:	// usually not an image
	case 0x804B0002:	// manually canceled
	}
},
observe: function (aSubject, aTopic, aData)
{
	switch (aTopic) {
	case "danbooru-down":
		if(getBrowser().getBrowserForTab(getBrowser().selectedTab) == this.mTab)
			this.cancel();
	}
}
};

/*
 * performs the actual action given POST data
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
	mStorage:null,
	mOutStr:null,
	mUpdateTags:false,

	start:function(aDatastream, aImgURI, aUpURIStr, aTab, aUpdateTags) {
		this.mUpdateTags = aUpdateTags;
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
		this.mLocation = aTab.contentDocument.location;
		var size = getSize(aImgURI.spec);
		var kbSize = Math.round((size/1024)*100)/100;

		if(getBrowser().getMessageForBrowser(this.mTab, 'top'))
			getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/danbooru-uploading.gif",
				danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploading')+' '+aImgURI.spec+
				((size != -1) ?(' ('+kbSize+' KB)') : ''),
				commondlgMsg.GetStringFromName('cancelButtonText'),
				null, "danbooru-up", null, "top", true,
				commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'));
		try{
			this.mChannel.asyncOpen(this, null);
			return true;
		} catch(e) {
			alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.post')+e);
		}
		return false;
	},

	addLinkToBrowserMessage:function(viewurl)
	{
		var top = getBrowser().getMessageForBrowser(this.mTab, "top");
		var msgtext = document.getAnonymousElementByAttribute(top, "anonid", "messageText");
		var link=document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:label");
		link.setAttribute("class", "danboorumsglink");
		link.setAttribute("anonid", "danboorulink");
		link.setAttribute("value", viewurl);
		link.setAttribute("flex", "1");
		link.setAttribute("onclick", "if(!handleLinkClick(event,'" + viewurl + "',this)) loadURI('" + viewurl + "', null, null);");
		msgtext.appendChild(link);
	},

	cancel:function()
	{
		if(this.mChannel)
		{
			var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
			this.mChannel.cancel(0x804b0002);
			os.removeObserver(this, "danbooru-up");
			if(getBrowser().getMessageForBrowser(this.mTab, 'top'))
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploadcancel'),
					"", "", "", null, "top", true, "");
			return true;
		}
		return false;
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
		os.removeObserver(this, "danbooru-up");
		const kErrorNetTimeout	= 0x804B000E;
		const kErrorNetRefused	= 0x804B000D;

		channel.QueryInterface(Components.interfaces.nsIHttpChannel);

		this.mOutStr.close();

		if(status == Components.results.NS_OK)
		{
			if(channel.responseStatus == 200 || channel.responseStatus == 201)
			{
				var errs="";
				var viewurl="";
				try { errs = channel.getResponseHeader("X-Danbooru-Errors"); } catch(e) {}
				try { viewurl = channel.getResponseHeader("X-Danbooru-Location"); } catch(e) {}

				if (errs) {	// what
					if(getBrowser().getMessageForBrowser(this.mTab, 'top'))
						getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
							danbooruUpMsg.GetStringFromName('danbooruUp.err.unexpected') + ' ' + errs,
							"", "", "", null, "top", true, "");
				} else {
					if(getBrowser().getMessageForBrowser(this.mTab, 'top'))
						getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
							danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploaded'),
							"", "", "", null, "top", true, "");
					if (viewurl)
						this.addLinkToBrowserMessage(viewurl);
					if (this.mUpdateTags)
						os.notifyObservers(null, "danbooru-update", null);
				}
			} else if (channel.responseStatus == 409) {
				var errs="";
				var viewurl="";
				try { errs = channel.getResponseHeader("X-Danbooru-Errors"); } catch(e) {}
				try { viewurl = channel.getResponseHeader("X-Danbooru-Location"); } catch(e) {}

				if (errs.search("(^|;)duplicate(;|$)") != -1) {
					if (getBrowser().getMessageForBrowser(this.mTab, 'top')) {
						getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
							danbooruUpMsg.GetStringFromName('danbooruUp.err.duplicate'),
							"", "", "", null, "top", true, "");

						if (viewurl)
							this.addLinkToBrowserMessage(viewurl);
					}
				} else if (getBrowser().getMessageForBrowser(this.mTab, 'top')) {
					getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
						danbooruUpMsg.GetStringFromName('danbooruUp.err.unhandled') + ' ' + errs,
						"", "", "", null, "top", true, "");
				}
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

				// FIXME: newlines do not work in any fashion
				if (getBrowser().getMessageForBrowser(this.mTab, 'top'))
					getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
						danbooruUpMsg.GetStringFromName('danbooruUp.err.serverresponse') + ' '
						+ channel.responseStatus + ' ' + channel.responseStatusText + "\n" + str.substr(0,511),
						"", "", "", null, "top", true, "");

				if (sis)
				{
					bis.close();
					sis.close();
				}
			}
		} else if (status == kErrorNetTimeout) {
			var errmsg = StrBundleSvc.createBundle('chrome://global/locale/appstrings.properties');
			var str = errmsg.FormatStringFromName('netTimeout', [channel.URI.spec])

			if (getBrowser().getMessageForBrowser(this.mTab, 'top'))
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.err.neterr') + ' ' + str,
					"", "", "", null, "top", true, "");
		} else if (status == kErrorNetRefused) {
			var errmsg = StrBundleSvc.createBundle('chrome://global/locale/appstrings.properties');
			var str = errmsg.FormatStringFromName('connectionFailure', [channel.URI.spec])

			if (getBrowser().getMessageForBrowser(this.mTab, 'top'))
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.err.neterr') + ' ' + str,
					"", "", "", null, "top", true, "");
		} else { // not NS_OK
			alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.poststop')+status.toString(16));
		}
		return;
	},
	observe: function (aSubject, aTopic, aData)
	{
		switch (aTopic) {
		case "danbooru-up":
			if(getBrowser().getBrowserForTab(getBrowser().selectedTab) == this.mTab)
				this.cancel();
		}
	}
};

window.addEventListener("load", danbooruImageInit, false);
var os = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
os.addObserver(danbooruTagUpdater, "danbooru-update", false);
os.addObserver(danbooruTagUpdater, "danbooru-options-changed", false);

danbooruTagUpdater.startupUpdate();

