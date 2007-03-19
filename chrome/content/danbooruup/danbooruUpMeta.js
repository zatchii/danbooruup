// image hashing for metadata dialog
//  load after original JS to replace getSize()
/*
const nsICacheService = Components.interfaces.nsICacheService;
const cacheService = Components.classes["@mozilla.org/network/cache-service;1"]
                     .getService(nsICacheService);
var httpCacheSession = cacheService.createSession("HTTP", 0, true);
httpCacheSession.doomEntriesIfExpired = false;
*/
const hashBranch = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.hashing.")

const danbooruUpBundle = Components.classes['@mozilla.org/intl/stringbundle;1']
			.getService(Components.interfaces.nsIStringBundleService)
			.createBundle('chrome://danbooruup/locale/danbooruUp.properties');

// hacked getSize function to hash images at the same time
function getSize(url) {
	var hashMD5 = false;
	var hashSHA1 = false;
	try {	hashMD5 = hashBranch.getBoolPref("md5"); } catch (ex) {}
	try {	hashSHA1 = hashBranch.getBoolPref("sha1"); } catch (ex) {}

	try
	{
		var cacheEntryDescriptor = httpCacheSession.openCacheEntry(url, Components.interfaces.nsICache.ACCESS_READ, false);
		if(cacheEntryDescriptor)
		{
			try{
			if(hashMD5) {
				var md5 = hashStreamMD5(cacheEntryDescriptor.openInputStream(0), cacheEntryDescriptor.dataSize);
				setInfo("image-md5", md5);
			}
			}catch(ex2) {}

			try{
			if(hashSHA1) {
				var sha1 = hashStreamSHA1(cacheEntryDescriptor.openInputStream(0), cacheEntryDescriptor.dataSize);
				setInfo("image-sha1-hex", sha1.hex);
				setInfo("image-sha1-base32", sha1.base32);
			}
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
			if(hashMD5) {
				var md5 = hashStreamMD5(cacheEntryDescriptor.openInputStream(0), cacheEntryDescriptor.dataSize);
				setInfo("image-md5", md5);
			}
			}catch(ex2) {}

			try{
			if(hashSHA1) {
				var sha1 = hashStreamSHA1(cacheEntryDescriptor.openInputStream(0), cacheEntryDescriptor.dataSize);
				setInfo("image-sha1-hex", sha1.hex);
				setInfo("image-sha1-base32", sha1.base32);
			}
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
			if(hashMD5 || hashSHA1) {
				if(hashMD5) {
					var md5 = hashStreamMD5(channel.open(), channel.file.fileSize);
					setInfo("image-md5", md5);
				}
				if(hashSHA1) {
					var sha1 = hashStreamSHA1(channel.open(), channel.file.fileSize);
					setInfo("image-sha1-hex", sha1.hex);
					setInfo("image-sha1-base32", sha1.base32);
				}
			}
			return channel.file.fileSize;
		} else {
			// nothing
			setInfo("image-md5", "");
			setInfo("image-sha1-hex", "");
			setInfo("image-sha1-base32", "");
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

const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function hashStreamSHA1(stream, length)
{
	var hasher = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
	hasher.init(hasher.SHA1);
	hasher.updateFromStream(stream, length);
	var outSHA1 = hasher.finish(false);
	var outSHA1Hex='';
	var alpha = "0123456789abcdef";
	var n;
	for(var qx=0, n; qx < outSHA1.length; qx++) {
		n = outSHA1.charCodeAt(qx);
		outSHA1Hex += alpha.charAt(n>>4) + alpha.charAt(n & 0xF);
	}

	var outSHA1Base32='';
	for(var d=0,n=0,qx=0;qx < outSHA1.length;) {
		d <<= 8;
		d |= outSHA1.charCodeAt(qx++);
		n += 8;

		while (n>=5) {
			n -= 5;
			outSHA1Base32 += base32[d>>n];
			d &= (1 << n)-1;
		}
	}

	return {hex:outSHA1Hex, base32:outSHA1Base32};
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
	md5label.setAttribute("value", danbooruUpBundle.GetStringFromName("danbooruUp.meta.md5"));
	md5row.appendChild(md5label);
	var md5box = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:textbox");
	md5box.setAttribute("id", "image-md5-text");
	md5box.readOnly=true;
	md5row.appendChild(md5box);
	eFileSize.parentNode.insertBefore(md5row, eFileSize.nextSibling);
}

function addSHA1Field()
{
	var eFileSize = document.getElementById("image-filesize");

	var sha1row = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:row");
	sha1row.setAttribute("id", "image-sha1-hex");

	var sha1sep = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:separator");
	sha1sep.setAttribute("orient", "vertical");
	sha1row.appendChild(sha1sep);
	var sha1label = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:label");
	sha1label.setAttribute("value", danbooruUpBundle.GetStringFromName("danbooruUp.meta.sha1"));
	sha1row.appendChild(sha1label);
	var sha1box = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:textbox");
	sha1box.setAttribute("id", "image-sha1-hex-text");
	sha1box.readOnly=true;
	sha1row.appendChild(sha1box);

	eFileSize.parentNode.insertBefore(sha1row, eFileSize.nextSibling);
	eFileSize = sha1row;

	sha1row = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:row");
	sha1row.setAttribute("id", "image-sha1-base32");

	sha1sep = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:separator");
	sha1sep.setAttribute("orient", "vertical");
	sha1row.appendChild(sha1sep);
	sha1label = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:label");
	sha1label.setAttribute("value", danbooruUpBundle.GetStringFromName("danbooruUp.meta.sha1b32"));
	sha1row.appendChild(sha1label);
	sha1box = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "xul:textbox");
	sha1box.setAttribute("id", "image-sha1-base32-text");
	sha1box.readOnly=true;
	sha1row.appendChild(sha1box);

	eFileSize.parentNode.insertBefore(sha1row, eFileSize.nextSibling);
}

if(hashBranch.getBoolPref("md5"))
	addMD5Field();
if(hashBranch.getBoolPref("sha1"))
	addSHA1Field();

