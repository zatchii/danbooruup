/*
const nsICacheService = Components.interfaces.nsICacheService;
const cacheService = Components.classes["@mozilla.org/network/cache-service;1"]
                     .getService(nsICacheService);
var httpCacheSession = cacheService.createSession("HTTP", 0, true);
httpCacheSession.doomEntriesIfExpired = false;
*/

// hacked getSize function to hash images at the same time
function getSize(url) {
	try
	{
		var cacheEntryDescriptor = httpCacheSession.openCacheEntry(url, Components.interfaces.nsICache.ACCESS_READ, false);
		if(cacheEntryDescriptor)
		{
			try{
			var md5 = hashStreamMD5(cacheEntryDescriptor.openInputStream(0), cacheEntryDescriptor.dataSize);
			setInfo("image-md5", md5);
			}catch(ex2) {}
			return cacheEntryDescriptor.dataSize;
		}
	}
	catch(ex) {}
	try
	{
		cacheEntryDescriptor = ftpCacheSession.openCacheEntry(url, Components.interfaces.nsICache.ACCESS_READ, false);
		if (cacheEntryDescriptor)
		{
			try{
			var md5 = hashStreamMD5(cacheEntryDescriptor.openInputStream(0), cacheEntryDescriptor.dataSize);
			setInfo("image-md5", md5);
			}catch(ex2) {}
			return cacheEntryDescriptor.dataSize;
		}
	}
	catch(ex) {}
	try
	{
		var ioService = Components.classes["@mozilla.org/network/io-service;1"]
				.getService(Components.interfaces.nsIIOService);
		var uriuri = ioService.newURI(url, window.arguments[0].ownerDocument.characterSet, null);
		if (uriuri.scheme == "file")
		{
			var channel = ioService.newChannelFromURI(uriuri);
			channel.QueryInterface(Components.interfaces.nsIFileChannel);
			var md5 = hashStreamMD5(channel.open(), channel.file.fileSize);
			setInfo("image-md5", md5);
		} else {
			// nothing
			setInfo("image-md5", "");
		}
	}
	catch(ex) {}
	return -1;
}

// probably don't need length
function hashStreamMD5(stream, length)
{
	var hasher = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
	hasher.init(hasher.MD5);
	hasher.updateFromStream(stream, length);
	var outMD5 = hasher.finish(false);
	var outMD5Hex='';
	var alpha = "0123456789abcdef";
	var n;
	for(var qx=0, n; qx<outMD5.length; qx++) {
		n = outMD5.charCodeAt(qx);
		outMD5Hex += alpha.charAt(n>>4) + alpha.charAt(n & 0xF);
	}
	return outMD5Hex;
}

// can't overlay since there are two levels without IDs
// i.e. vbox#image-sec > grid > rows > row#image-filesize
function addMD5Field()
{
	var eFileSize = document.getElementById("image-filesize");

	var md5row = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:row");
	md5row.setAttribute("id", "image-md5");

	var md5sep = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:separator");
	md5sep.setAttribute("orient", "vertical");
	md5row.appendChild(md5sep);
	var md5label = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:label");
	md5label.setAttribute("value", "MD5:"); //FIXME
	md5row.appendChild(md5label);
	var md5box = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:textbox");
	md5box.setAttribute("id", "image-md5-text");
	md5box.readOnly=true;
	md5row.appendChild(md5box);
	eFileSize.parentNode.insertBefore(md5row, eFileSize.nextSibling);
}

addMD5Field();
