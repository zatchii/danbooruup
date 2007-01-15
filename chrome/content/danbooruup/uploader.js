// uploading code, loaded into helper service scope
var StrBundleSvc	= Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService);
var danbooruUpMsg	= StrBundleSvc.createBundle('chrome://danbooruup/locale/danbooruUp.properties');
var commondlgMsg	= StrBundleSvc.createBundle('chrome://mozapps/locale/extensions/update.properties');

var cacheService	= Components.classes["@mozilla.org/network/cache-service;1"]
                    .getService(Components.interfaces.nsICacheService);
var httpCacheSession = cacheService.createSession("HTTP", 0, true);
httpCacheSession.doomEntriesIfExpired = false;
var ftpCacheSession = cacheService.createSession("FTP", 0, true);
ftpCacheSession.doomEntriesIfExpired = false;

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
  	var fieldRating		= "rating";
  	var fieldMD5		= "md5";

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
    var outMD5Hex = '';
    var n;

    var alpha = "0123456789abcdef";
    for(var qx=0; qx<outMD5.length; qx++)
    {
      n = outMD5.charCodeAt(qx);
      outMD5Hex += alpha.charAt(n>>4) + alpha.charAt(n & 0xF);
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

    // thanks to http://aaiddennium.online.lt/tools/js-tool-symbols-entities-symbols.html for
    // pointing out what turned out to be obvious
    var toEnts = function(sText) {
      var sNewText = ""; var iLen = sText.length;
      for (i=0; i<iLen; i++) {
        iCode = sText.charCodeAt(i); sNewText += (iCode > 255 ? "&#" + iCode + ";": sText.charAt(i));
      }
      return sNewText;
    }

    postChunk += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fieldTitle
      + "\"\r\n\r\n" + toEnts(this.mTitle) + "\r\n";

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

        var notificationBox = this.mTab.linkedBrowser.parentNode;
        var notification = notificationBox.getNotificationWithValue("danbooru-up");
        if (notification) {
          notification.label = message;
        }
        else {
          var buttons = [{
            label: popupButtonText,
            accessKey: null,
            popup: null,
            callback: null
          }];

          //const priority = notificationBox.PRIORITY_WARNING_MEDIUM;
          var priority = notificationBox.PRIORITY_INFO_MEDIUM;
          notificationBox.appendNotification(message, "danbooru-up",
              "chrome://global/skin/throbber/Throbber-small.png",
              priority, null);
        }

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

    var notificationBox = this.mTab.linkedBrowser.parentNode;
    var notification = notificationBox.getNotificationWithValue("danbooru-up");
    if (notification) {
      notificationBox.removeNotification(notification);
    }
    var buttons = [{
         label: commondlgMsg.GetStringFromName('cancelButtonText'),
         accessKey: commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'),
         popup: null,
         callback: this.cancel
    }];

    //const priority = notificationBox.PRIORITY_WARNING_MEDIUM;
    var priority = notificationBox.PRIORITY_INFO_MEDIUM;
    notificationBox.appendNotification(danbooruUpMsg.GetStringFromName('danbooruUp.msg.reading')+ " "+this.mRealSource.spec,
        "danbooru-up",
        "chrome://global/skin/throbber/Throbber-small.gif",
        priority, buttons);
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
		this.mLocation = aTab.linkedBrowser.contentDocument.location;
		var size = getSize(aImgURI.spec);
		var kbSize = Math.round((size/1024)*100)/100;

		var notificationBox = this.mTab.linkedBrowser.parentNode;
		var notification = notificationBox.getNotificationWithValue("danbooru-up");
		if (notification) {
			notificationBox.removeNotification(notification);
		}
		var buttons = [{
			label: commondlgMsg.GetStringFromName('cancelButtonText'),
			accessKey: commondlgMsg.GetStringFromName('cancelButtonTextAccesskey'),
			popup: null,
			callback: this.cancel
		}];

		//const priority = notificationBox.PRIORITY_WARNING_MEDIUM;
		var priority = notificationBox.PRIORITY_INFO_MEDIUM;
		notificationBox.appendNotification(
				danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploading')+' '+aImgURI.spec+
				((size != -1) ?(' ('+kbSize+' KB)') : ''),
				"danbooru-up",
				"chrome://global/skin/throbber/Throbber-small.gif",
				priority, buttons);

		try{
			this.mChannel.asyncOpen(this, null);
			return true;
		} catch(e) {
			alert(danbooruUpMsg.GetStringFromName('danbooruUp.err.post')+e);
		}
		return false;
	},

	// hack to get a clickable link in the browser message
	addLinkToBrowserMessage:function(viewurl)
	{
		var notificationBox = this.mTab.linkedBrowser.parentNode;
		var notification = notificationBox.getNotificationWithValue("danbooru-up");
		var msgtext = this.mTab.linkedBrowser.ownerDocument.getAnonymousElementByAttribute(notification, "anonid", "messageText");
		var link = this.mTab.linkedBrowser.ownerDocument.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:label");
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
			try { os.removeObserver(this, "danbooru-up"); } catch(e) {}

			var notificationBox = this.mTab.linkedBrowser.parentNode;
			var notification = notificationBox.getNotificationWithValue("danbooru-up");
			if (notification) {
				notificationBox.removeNotification(notification);
			}

			var priority = notificationBox.PRIORITY_WARNING_MEDIUM;
			//const priority = notificationBox.PRIORITY_INFO_MEDIUM;
			notificationBox.appendNotification(
					danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploadcancel'),
					"danbooru-up",
					"chrome://danbooruup/skin/icon.ico",
					priority, null);
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
		try { os.removeObserver(this, "danbooru-up"); } catch(e) {}
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
					var notificationBox = this.mTab.linkedBrowser.parentNode;
					var notification = notificationBox.getNotificationWithValue("danbooru-up");
					if (notification) {
						notificationBox.removeNotification(notification);
					}

					var priority = notificationBox.PRIORITY_WARNING_MEDIUM;
					//const priority = notificationBox.PRIORITY_INFO_MEDIUM;
					notificationBox.appendNotification(
							danbooruUpMsg.GetStringFromName('danbooruUp.err.unexpected') + ' ' + errs,
							"danbooru-up",
							"chrome://danbooruup/skin/danbooru-attention.gif",
							priority, null);
				} else {
					var notificationBox = this.mTab.linkedBrowser.parentNode;
					var notification = notificationBox.getNotificationWithValue("danbooru-up");
					if (notification) {
						notificationBox.removeNotification(notification);
					}

					//const priority = notificationBox.PRIORITY_WARNING_MEDIUM;
					var priority = notificationBox.PRIORITY_INFO_MEDIUM;
					notificationBox.appendNotification(
							danbooruUpMsg.GetStringFromName('danbooruUp.msg.uploaded'),
							"danbooru-up",
							"chrome://danbooruup/skin/icon.ico",
							priority, null);

					if (viewurl)
						this.addLinkToBrowserMessage(viewurl);
					if (this.mUpdateTags)
						os.notifyObservers(null, "danbooru-update", "");
				}
			} else if (channel.responseStatus == 409) {
				var errs="";
				var viewurl="";
				var message="";
				try { errs = channel.getResponseHeader("X-Danbooru-Errors"); } catch(e) {}
				try { viewurl = channel.getResponseHeader("X-Danbooru-Location"); } catch(e) {}

				if (errs.search("(^|;)duplicate(;|$)") != -1) {
					message = danbooruUpMsg.GetStringFromName('danbooruUp.err.duplicate');
				} else if (errs.search("(^|;)mismatched md5(;|$)") != -1) {
					message = danbooruUpMsg.GetStringFromName('danbooruUp.err.corruptupload');
				} else {
					message = danbooruUpMsg.GetStringFromName('danbooruUp.err.unhandled') + ' ' + errs;
				}

				var notificationBox = this.mTab.linkedBrowser.parentNode;
				var notification = notificationBox.getNotificationWithValue("danbooru-up");
				if (notification) {
					notificationBox.removeNotification(notification);
				}

				var priority = notificationBox.PRIORITY_WARNING_MEDIUM;
				//const priority = notificationBox.PRIORITY_INFO_MEDIUM;
				notificationBox.appendNotification(message, "danbooru-up",
						"chrome://danbooruup/skin/danbooru-attention.gif",
						priority, null);

				if (viewurl)
					this.addLinkToBrowserMessage(viewurl);

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
				var notificationBox = this.mTab.linkedBrowser.parentNode;
				var notification = notificationBox.getNotificationWithValue("danbooru-up");
				if (notification) {
					notificationBox.removeNotification(notification);
				}

				var priority = notificationBox.PRIORITY_WARNING_MEDIUM;
				//const priority = notificationBox.PRIORITY_INFO_MEDIUM;
				notificationBox.appendNotification(message, "danbooru-up",
						"chrome://danbooruup/skin/danbooru-attention.gif",
						priority, null);

				if (sis)
				{
					bis.close();
					sis.close();
				}
			}
		} else if (status == kErrorNetTimeout || status == kErrorNetRefused) {
			var errmsg = StrBundleSvc.createBundle('chrome://global/locale/appstrings.properties');
			var str;

			if (status == kErrorNetTimeout)
				str = errmsg.FormatStringFromName('netTimeout', [channel.URI.spec])
			else if (status == kErrorNetRefused)
				str = errmsg.FormatStringFromName('connectionFailure', [channel.URI.spec])

			var notificationBox = this.mTab.linkedBrowser.parentNode;
			var notification = notificationBox.getNotificationWithValue("danbooru-up");
			if (notification) {
				notificationBox.removeNotification(notification);
			}

			var priority = notificationBox.PRIORITY_WARNING_MEDIUM;
			//const priority = notificationBox.PRIORITY_INFO_MEDIUM;
			notificationBox.appendNotification(
					danbooruUpMsg.GetStringFromName('danbooruUp.err.neterr') + ' ' + str,
					"danbooru-up",
					"chrome://danbooruup/skin/danbooru-attention.gif",
					priority, null);

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

