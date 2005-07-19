// vim: set ts=8 sw=8 noet :
var danbooruImgNode	= null;
const StrBundleSvc	= Components.classes['@mozilla.org/intl/stringbundle;1']
			.getService(Components.interfaces.nsIStringBundleService);
var danbooruUpMsg	= StrBundleSvc.createBundle('chrome://danbooruup/locale/danbooruUp.properties');
var commondlgMsg	= StrBundleSvc.createBundle('chrome://mozapps/locale/extensions/update.properties');

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

	var ioService	= Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);

	// there HAS to be another way...
	if (imgURIStr.substr(0,7) != "http://" && imgURIStr.substr(0,6) != "ftp://" && imgURIStr.substr(0,7) != "file://") {
		var locationURI	= ioService.newURI(danbooruImgNode.ownerDocument.location, "", null)
		imgURIStr = locationURI.resolve(imgURIStr);
	}

	window.openDialog("chrome://danbooruup/content/danbooruUpBox.xul",
		"danbooruUpBox", "centerscreen,chrome,resizable=yes",
		{imageNode:danbooruImgNode, imageURI:imgURIStr, wind:thistab, start:danbooruStartUpload});
}

function danbooruStartUpload(aSource, aTags, aTitle, aDest, aNode, aWind)
{
	var ioService	= Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);
	var uploader;
	var imgChannel	= ioService.newChannel(aSource,"",null);
	var os		= Components.classes["@mozilla.org/observer-service;1"]
			.getService(Components.interfaces.nsIObserverService);

	if (aSource.substr(0,7) == "file://") {
		imgChannel = imgChannel.QueryInterface(Components.interfaces.nsIFileChannel);
		uploader = new danbooruUploader(aSource, aTags, aTitle, aDest, aWind, true, aWind.contentDocument.location);
		// add entry to the observer
		os.addObserver(uploader, "danbooru-down", false);
		imgChannel.asyncOpen(uploader, null);
	} else {
		var cookieJar	= Components.classes["@mozilla.org/cookieService;1"]
				.getService(Components.interfaces.nsICookieService);
		var cookieStr = cookieJar.getCookieString(ioService.newURI(aNode.ownerDocument.location,"",null), null);

		imgChannel = imgChannel.QueryInterface(Components.interfaces.nsIHttpChannel);
		imgChannel.referrer = ioService.newURI(aNode.ownerDocument.location, "", null);
		imgChannel.setRequestHeader("Cookie", cookieStr, true);

		// don't need to bother with Uploader's array transfer
		var listener = Components.classes["@mozilla.org/network/simple-stream-listener;1"]
				.createInstance(Components.interfaces.nsISimpleStreamListener);
		uploader = new danbooruUploader(aSource, aTags, aTitle, aDest, aWind, false, aWind.contentDocument.location);

		// add entry to the observer
		os.addObserver(uploader, "danbooru-down", false);
		listener.init(uploader.mOutStr, uploader);
		imgChannel.asyncOpen(listener, null);
	}
}

/*
 * retrieves an image and constructs the multipart POST data
 */
function danbooruUploader(aSource, aTags, aTitle, aDest, aTab, aLocal, aLocation)
{
	this.mSource = aSource;
	this.mTags = aTags;
	this.mTitle = aTitle;
	this.mDest = aDest;
	this.mTab = aTab;
	this.mLocation = aLocation;

	this.mStorage = Components.classes["@mozilla.org/storagestream;1"]
			.createInstance(Components.interfaces.nsIStorageStream);
	this.mStorage.init(4096,64*1048576,null);

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

upload: function ()
{
	var fieldFile	="post[file]";
	var fieldSource	="post[source_url]";
	var fieldTags	="post[tags]";
	var fieldTitle	="post[title]";

	var ioService	= Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);
	var postDS	= Components.classes["@mozilla.org/io/multiplex-input-stream;1"]
			.createInstance(Components.interfaces.nsIMultiplexInputStream)
			.QueryInterface(Components.interfaces.nsIInputStream);
	var postChunk	= "";
	var boundary	= "---------------------------" + Math.floor(Math.random()*0xFFFFFFFF)
			+ Math.floor(Math.random()*0xFFFFFFFF) + Math.floor(Math.random()*0xFFFFFFFF);

	var fn = "danbooruup" + new Date().getTime() + Math.floor(Math.random()*0xFFFFFFFF);
	try {
		var mimeService = Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsIMIMEService);
		var ext = mimeService.getPrimaryExtension(this.mChannel.contentType, null);
		fn += "." + ext;
	}catch(e){}

	postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldSource
		+ "\"\r\n\r\n" + /*encodeURIComponent*/(this.mSource) + "\r\n";
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
		"Content-Type: application/octet-stream\r\n\r\n";

	// the beginning
	var strIS = Components.classes["@mozilla.org/io/string-input-stream;1"]
		.createInstance(Components.interfaces.nsIStringInputStream);
	strIS.setData(postChunk,-1);
	postDS.appendStream(strIS);

	// the middle
	postDS.appendStream(this.mInStr);

	// the end
	var endIS = Components.classes["@mozilla.org/io/string-input-stream;1"]
		.createInstance(Components.interfaces.nsIStringInputStream);
	endIS.setData("\r\n--" + boundary + "--\r\n", -1);
	postDS.appendStream(endIS);

	// turn it into a MIME stream
	var prefs	= Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefBranch);
	// upload URI and cookie info
	var upURI = ioService.newURI(this.mDest,null,null);
	var cookieJar	= Components.classes["@mozilla.org/cookieService;1"]
			.getService(Components.interfaces.nsICookieService);
	var cookieStr = cookieJar.getCookieString(upURI, null);

	var mimeIS = Components.classes["@mozilla.org/network/mime-input-stream;1"]
			.createInstance(Components.interfaces.nsIMIMEInputStream);
	mimeIS.addHeader("Content-Type", "multipart/form-data; boundary="+ boundary, false);
	mimeIS.addHeader("Cookie", cookieStr, false);

	mimeIS.addContentLength = true;
	mimeIS.setData(postDS);

	// post

	var postage = new danbooruPoster();
	var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
	os.addObserver(postage, "danbooru-up", false);
	postage.start(mimeIS, this.mSource, this.mDest, this.mTab);
},
cancel:function()
{
	try{
	if(this.mChannel)
	{
		var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		this.mChannel.cancel(0x804b0002);
		os.removeObserver(this, "danbooru-down");
		if(this.mTab)
			getBrowser().showMessage(this.mTab, "chrome://global/skin/throbber/Throbber-small.png",
				danbooruUpMsg.GetStringFromName('danbooruUp.msg.readcancel'), "",
				null, "", "danbooru-up", null, "top", true);
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
	//alert('got '+count+' stream has '+inStr.available() +' want '+channel.contentLength);
	this.mOutStr.writeByteArray(bis.readByteArray(count),count);
	}catch(e){alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.read')+e);}
},
onStartRequest: function (channel, ctxt)
{
	if( channel.contentType.substring(0,6) != "image/" ) {
		alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.notimage'));
		throw Components.results.NS_ERROR_UNEXPECTED;
	}

	//alert(channel.contentType + ' ' + channel.contentLength + "\n" + channel.URI.asciiSpec );
	this.mChannel = channel;
	if(this.mTab)
		getBrowser().showMessage(this.mTab, "chrome://global/skin/throbber/Throbber-small.gif",
			danbooruUpMsg.GetStringFromName('danbooruUp.msg.reading')+ " "+this.mSource,
			commondlgMsg.GetStringFromName('cancelButtonText'), commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'),
			null, "danbooru-down", null, "top", true);
},
onStopRequest: function (channel, ctxt, status)
{
	switch(status){
	case Components.results.NS_OK:
		try {
		this.mOutStr.close();
		this.mInStr = Components.classes["@mozilla.org/network/buffered-input-stream;1"]
				.createInstance(Components.interfaces.nsIBufferedInputStream);
		this.mInStr.init(this.mStorage.newInputStream(0),8192);
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
},
};

/*
 * performs the actual action given POST data
 */
function danbooruPoster()
{
	this.mStorage = Components.classes["@mozilla.org/storagestream;1"]
			.createInstance(Components.interfaces.nsIStorageStream);
	this.mStorage.init(4096,131072,null);

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

	start:function(datastream, imgURIStr, upURIStr, ctxt) {
		var ioService	= Components.classes["@mozilla.org/network/io-service;1"]
				.getService(Components.interfaces.nsIIOService);
		var prefs	= Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefBranch);
		// upload URI and cookie info
		this.mChannel = ioService.newChannel(upURIStr,"",null)
				.QueryInterface(Components.interfaces.nsIRequest)
				.QueryInterface(Components.interfaces.nsIHttpChannel)
				.QueryInterface(Components.interfaces.nsIUploadChannel);
		this.mChannel.setUploadStream(datastream, null, -1);
		this.mChannel.requestMethod = "POST";
		this.mChannel.setRequestHeader("X-Danbooru", "no-redirect", false);
		this.mChannel.allowPipelining = false;

		this.mTab = ctxt;
		this.mLocation = ctxt.contentDocument.location;
		if(this.mTab)
			getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/danbooru-uploading.gif",
				danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploading')+' '+imgURIStr,
				commondlgMsg.GetStringFromName('cancelButtonText'),
				commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'),
				null, "danbooru-up", null, "top", true);
		try{
			this.mChannel.asyncOpen(this, null);
			return true;
		}catch(e){alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.post')+e);}
		return false;
	},

	addLinkToBrowserMessage:function(viewurl)
	{
		var top = getBrowser().getMessageForBrowser(this.mTab, 'top');
		var msgtext = document.getAnonymousElementByAttribute(top, 'anonid', 'messageText');
		var link=document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul','xul:label');
		link.setAttribute('class', 'danboorumsglink');
		link.setAttribute('anonid', 'danboorulink');
		link.setAttribute('value', viewurl);
		link.setAttribute('flex', '1');
		link.setAttribute('onclick', "if(!handleLinkClick(event,'" + viewurl + "',this)) loadURI('" + viewurl + "', null, null);");
		msgtext.appendChild(link);
	},

	cancel:function()
	{
		if(this.mChannel)
		{
			var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
			this.mChannel.cancel(0x804b0002);
			os.removeObserver(this, "danbooru-up");
			if(this.mTab)
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploadcancel'), "",
					null, "", "", null, "top", true);
			return true;
		}
		return false;
	},

	onDataAvailable: function (channel, ctxt, inStr, sourceOffset, count)
	{
		try{
		channel.QueryInterface(Components.interfaces.nsIHttpChannel);
		var bis = Components.classes["@mozilla.org/binaryinputstream;1"]
			.createInstance(Components.interfaces.nsIBinaryInputStream);
		bis.setInputStream(inStr);
		this.mOutStr.writeByteArray(bis.readByteArray(count),count);
		}catch(e){alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.read')+e);}
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

		this.mOutStr.close();

		if(status == Components.results.NS_OK) {
		if(channel.responseStatus == 200 || channel.responseStatus == 201)
		{
			var errs="";
			var viewurl="";
			try { errs = channel.getResponseHeader("X-Danbooru-Errors"); } catch(e) {}
			try { viewurl = channel.getResponseHeader("X-Danbooru-View-Url"); } catch(e) {}
			//alert(channel.responseStatus + "\n" + errs + "\n" + viewurl);

			if (errs) {	// what
				if(this.mTab)
					getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
						danbooruUpMsg.GetStringFromName('danbooruUp.err.unexpected') + ' ' + errs,
						"", null, "", "", null, "top", true);
				
			} else {
				if(this.mTab)
					getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
						danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploaded'),
						"", null, "", "", null, "top", true);
				if (viewurl)
					this.addLinkToBrowserMessage(viewurl);
			}
		} else if (channel.responseStatus == 409) {
			var errs="";
			var viewurl="";
			try { errs = channel.getResponseHeader("X-Danbooru-Errors"); } catch(e) {}
			try { viewurl = channel.getResponseHeader("X-Danbooru-View-Url"); } catch(e) {}

			if (errs.search("(^|;)duplicate(;|$)") != -1) {
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.err.duplicate'),
					"", null, "", "", null, "top", true);
				
				if (viewurl)
					this.addLinkToBrowserMessage(viewurl);

				getBrowser().getMessageForBrowser(this.mTab, 'top');
			} else {
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.err.unhandled') + ' ' + errs,
					"", null, "", "", null, "top", true);
			}
		} else {
			var bis = Components.classes["@mozilla.org/binaryinputstream;1"]
				.createInstance(Components.interfaces.nsIBinaryInputStream);
			var sis = this.mStorage.newInputStream(0);
			bis.setInputStream(sis);
			var str=bis.readBytes(sis.available());

			// FIXME: newlines do not work in any fashion
			if (this.mTab)
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.err.serverresponse') + ' '
					+ channel.responseStatus + ' ' + channel.responseStatusText + "\n" + str,
					"", null, "", "", null, "top", true);
			bis.close(); sis.close();
		}
		} else if (status == kErrorNetTimeout) {
			var errmsg = StrBundleSvc.createBundle('chrome://global/locale/appstrings.properties');
			var str = errmsg.GetStringFromName('netTimeout')
			str = str.replace('%S', channel.URI.spec);
			if (this.mTab)
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.err.neterr') + ' ' + str,
					"", null, "", "", null, "top", true);
		} else if (status == kErrorNetRefused) {
			var errmsg = StrBundleSvc.createBundle('chrome://global/locale/appstrings.properties');
			var str = errmsg.GetStringFromName('connectionFailure')
			str = str.replace('%S', channel.URI.spec);
			if (this.mTab)
				getBrowser().showMessage(this.mTab, "chrome://danbooruup/skin/icon.ico",
					danbooruUpMsg.GetStringFromName('danbooruUp.err.neterr') + ' ' + str,
					"", null, "", "", null, "top", true);
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
	},
};

window.addEventListener("load", danbooruImageInit, false);

