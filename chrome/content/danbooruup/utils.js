
// wraps nsIPrompt calls to suppress NS_NOINTERFACE errors in error console
const danbooruPromptWrapper = {
	alert : function(dlgTitle, text)
	{
		if (this.mInteractive)
			this.defaultPrompt.alert(null, dlgTitle, text);
	},
	alertCheck : function(dlgTitle, text, checkBoxLabel, checkObj)
	{
		if (this.mInteractive)
			this.defaultPrompt.alertCheck(null, dlgTitle, text, checkBoxLabel, checkObj);
	},
	confirm : function(dlgTitle, text)
	{
		if (this.mInteractive)
			this.defaultPrompt.confirm(null, dlgTitle, text);
	},
	confirmCheck : function(dlgTitle, text, checkBoxLabel, checkObj)
	{
		if (this.mInteractive)
			this.defaultPrompt.confirmCheck(null, dlgTitle, text, checkBoxLabel, checkObj);
	},
	confirmEx : function(dlgTitle, text, btnFlags, btn0Title, btn1Title, btn2Title, checkBoxLabel, checkVal)
	{
		if (this.mInteractive)
			this.defaultPrompt.confirmEx(null, dlgTitle, text, btnFlags, btn0Title, btn1Title, btn2Title, checkBoxLabel, checkVal);
	},
	select : function(dlgTitle, text, count, selectList, outSelection)
	{
		if (this.mInteractive)
			this.defaultPrompt.select(null, dlgTitle, text, count, selectList, outSelection);
	},
	prompt : function(dlgTitle, label, inputvalueObj, checkBoxLabel, checkObj)
	{
		if (this.mInteractive)
			this.defaultPrompt.prompt(null, dlgTitle, label, inputvalueObj, checkBoxLabel, checkObj);
	},
	promptPassword : function(dlgTitle, label, pwObj, checkBoxLabel, savePWObj)
	{
		if (this.mInteractive)
			this.defaultPrompt.promptPassword(null, dlgTitle, label, pwObj, checkBoxLabel, savePWObj);
	},
	promptUsernameAndPassword : function(dlgTitle, label, userObj, pwObj, savePWLabel, savePWObj)
	{
		if (this.mInteractive)
			this.defaultPrompt.promptUsernameAndPassword(null, dlgTitle, label, userObj, pwObj, savePWLabel, savePWObj);
	}
};

function AddDanbooruPromptWrapper(dest)
{
	//dest.defaultPrompt = Components.classes["@mozilla.org/network/default-prompt;1"].createInstance(Components.interfaces.nsIPrompt);
	dest.defaultPrompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].createInstance(Components.interfaces.nsIPromptService);
	for(var w in danbooruPromptWrapper)
	{
		dest[w] = danbooruPromptWrapper[w];
	}
	return dest;
}

// from extensions/sroaming/resources/content/transfer/utility.js
// though we don't particularly need the FTP bits
const kNS_OK = 0;
const kMyBase = 0x80780000; // Generic module, only valid within our module
const kNetBase = 2152398848; // 0x804B0000
const kFilesBase = 2152857600; // 0x80520000
const kUnknownType = kFilesBase + 4; // nsError.h
const kDiskFull = kFilesBase + 10; // nsError.h
const kNoDeviceSpace = kFilesBase + 16; // nsError.h
const kNameTooLong = kFilesBase + 17; // nsError.h
const kFileNotFound = kFilesBase + 18; // nsError.h, 0x80520012
const kAccessDenied = kFilesBase + 21; // nsError.h
const kNetReset = kNetBase + 20;
const kErrorMalformedURI = kNetBase + 10; // netCore.h
const kNotConnected = kNetBase + 12; // netCore.h
const kConnectionRefused = kNetBase + 13;
const kNetTimeout = kNetBase + 14;
const kInProgress = kNetBase + 15; // netCore.h
const kOffline = kNetBase + 16; // netCore.h; 0x804b0010
const kUnknownHost = kNetBase + 30; // nsNetErr; was "no connection or timeout"
const kUnknownProxyHost = kNetBase + 42; // nsNetError.h
const kPortAccessNotAllowed = kNetBase + 19; // netCore.h
const kErrorDocumentNotCached = kNetBase + 70; // nsNetError.h
const kErrorBindingFailed = kNetBase + 1; // netCore.h
const kErrorBindingAborted = kNetBase + 2; // netCore.h
const kErrorBindingRedirected = kNetBase + 3; // netCore.h
const kErrorBindingRetargeted = kNetBase + 4; // netCore.h
const kStatusBeginFTPTransaction = kNetBase + 27; // ftpCore.h
const kStatusEndFTPTransaction = kNetBase + 28; // ftpCore.h
const kStatusFTPLogin = kNetBase + 21; // ftpCore.h
const kStatusFTPCWD = kNetBase + 22; // ftpCore.h
const kStatusFTPPassive = kNetBase + 23; // ftpCore.h
const kStatusFTPPWD = kNetBase + 24; // ftpCore.h
const kErrorNoInterface = 0x80004002; // nsError.h
const kErrorNotImplemented = 0x80004001; // nsError.h
const kErrorAbort = 0x80004004; // nsError.h
const kErrorFailure = 0x80004005; // nsError.h
const kErrorUnexpected = 0x8000ffff; // nsError.h
const kErrorInvalidValue = 0x80070057; // nsError.h
const kErrorNotAvailable = 0x80040111; // nsError.h
const kErrorNotInited = 0xC1F30001; // nsError.h
const kErrorAlreadyInited = 0xC1F30002; // nsError.h
const kErrorFTPAuthNeeded = 0x4B001B; // XXX not sure what exactly this is or
   // where it comes from (grep doesn't find it in dec or hex notation), but
   // that's what I get when the credentials are not accepted by the FTP server
const kErrorFTPAuthFailed = 0x4B001C; // dito
const kStatusHTTP = kMyBase + 0;
/* See Transfer.onStatus().
   *_Status are the number we get from nsIProgressEventSink, the others
   are what we use internally in the rest of the code. */
const kStatusResolvingHost = kMyBase + 5;
const kStatusConnectedTo = kMyBase + 6;
const kStatusSendingTo = kMyBase + 7;
const kStatusReceivingFrom = kMyBase + 8;
const kStatusConnectingTo = kMyBase + 9;
const kStatusWaitingFor = kMyBase + 10;
const kStatusReadFrom = kMyBase + 11;
const kStatusWroteTo = kMyBase + 12;
const kStatusResolvingHost_Status = kNetBase + 3;// nsISocketTransport.idl
const kStatusConnectedTo_Status = kNetBase + 4; // nsISocketTransport.idl
const kStatusSendingTo_Status = kNetBase + 5; // nsISocketTransport.idl
const kStatusReceivingFrom_Status = kNetBase + 6; // nsISocketTransport.idl
const kStatusConnectingTo_Status = kNetBase + 7; // nsISocketTransport.idl
const kStatusWaitingFor_Status = kNetBase + 10; // nsISocketTransport.idl
const kStatusReadFrom_Status = kNetBase + 8; // nsIFileTransportService.idl
const kStatusWroteTo_Status = kNetBase + 9; // nsIFileTransportService.idl

// Translates an XPCOM result code into a String similar to the C++ constant.
function NameForStatusCode(aStatusCode)
{
  switch (aStatusCode)
  {
    case 0:
      return "NS_OK";
    case kStatusReadFrom:
    case kStatusReadFrom_Status:
      return "NET_STATUS_READ_FROM";
    case kStatusWroteTo:
    case kStatusWroteTo_Status:
      return "NET_STATUS_WROTE_TO";
    case kStatusReceivingFrom:
    case kStatusReceivingFrom_Status:
      return "NET_STATUS_RECEIVING_FROM";
    case kStatusSendingTo:
    case kStatusSendingTo_Status:
      return "NET_STATUS_SENDING_TO";
    case kStatusWaitingFor:
    case kStatusWaitingFor_Status:
      return "NET_STATUS_WAITING_FOR";
    case kStatusResolvingHost:
    case kStatusResolvingHost_Status:
      return "NET_STATUS_RESOLVING_HOST";
    case kStatusConnectedTo:
    case kStatusConnectedTo_Status:
      return "NET_STATUS_CONNECTED_TO";
    case kStatusConnectingTo:
    case kStatusConnectingTo_Status:
      return "NET_STATUS_CONNECTING_TO";
    case kStatusHTTP:
      return "See HTTP response";
    case kErrorBindingFailed:
      return "BINDING_FAILED";
    case kErrorBindingAborted:
      return "BINDING_ABORTED";
    case kErrorBindingRedirected:
      return "BINDING_REDIRECTED";
    case kErrorBindingRetargeted:
      return "BINDING_RETARGETED";
    case kErrorMalformedURI:
      return "MALFORMED_URI";
    case kNetBase + 11: // netCore.h
      return "ALREADY_CONNECTED";
    case kNotConnected:
      return "NOT_CONNECTED";
    case kConnectionRefused:
      return "CONNECTION_REFUSED";
    case kNetTimeout:
      return "NET_TIMEOUT";
    case kInProgress:
      return "IN_PROGRESS";
    case kOffline:
      return "OFFLINE";
    case kNetBase + 17: // netCore.h
      return "NO_CONTENT";
    case kNetBase + 18: // netCore.h
      return "UNKNOWN_PROTOCOL";
    case kPortAccessNotAllowed:
      return "PORT_ACCESS_NOT_ALLOWED";
    case kNetReset:
      return "NET_RESET";
    case kStatusFTPLogin:
      return "FTP_LOGIN";
    case kStatusFTPCWD:
      return "FTP_CWD";
    case kStatusFTPPassive:
      return "FTP_PASV";
    case kStatusFTPPWD:
      return "FTP_PWD";
    case kUnknownHost:
      return "UNKNOWN_HOST or NO_CONNECTION_OR_TIMEOUT";
    case kUnknownProxyHost:
      return "UNKNOWN_PROXY_HOST";
    case kErrorFTPAuthNeeded:
      return "FTP auth needed (?)";
    case kErrorFTPAuthFailed:
      return "FTP auth failed (?)";
    case kStatusBeginFTPTransaction:
      return "NET_STATUS_BEGIN_FTP_TRANSACTION";
    case kStatusEndFTPTransaction:
      return "NET_STATUS_END_FTP_TRANSACTION";
    case kNetBase + 61:
      return "NET_CACHE_KEY_NOT_FOUND";
    case kNetBase + 62:
      return "NET_CACHE_DATA_IS_STREAM";
    case kNetBase + 63:
      return "NET_CACHE_DATA_IS_NOT_STREAM";
    case kNetBase + 64:
      return "NET_CACHE_WAIT_FOR_VALIDATION"; // XXX error or status?
    case kNetBase + 65:
      return "NET_CACHE_ENTRY_DOOMED";
    case kNetBase + 66:
      return "NET_CACHE_READ_ACCESS_DENIED";
    case kNetBase + 67:
      return "NET_CACHE_WRITE_ACCESS_DENIED";
    case kNetBase + 68:
      return "NET_CACHE_IN_USE";
    case kErrorDocumentNotCached:
      return "NET_DOCUMENT_NOT_CACHED";//XXX error or status? seems to be error
    case kFilesBase + 1: // nsError.h
      return "UNRECOGNIZED_PATH";
    case kFilesBase + 2: // nsError.h
      return "UNRESOLABLE SYMLINK";
    case kFilesBase + 4: // nsError.h
      return "UNKNOWN_TYPE";
    case kFilesBase + 5: // nsError.h
      return "DESTINATION_NOT_DIR";
    case kFilesBase + 6: // nsError.h
      return "TARGET_DOES_NOT_EXIST";
    case kFilesBase + 8: // nsError.h
      return "ALREADY_EXISTS";
    case kFilesBase + 9: // nsError.h
      return "INVALID_PATH";
    case kDiskFull:
      return "DISK_FULL";
    case kFilesBase + 11: // nsError.h
      return "FILE_CORRUPTED (justice department, too)";
    case kFilesBase + 12: // nsError.h
      return "NOT_DIRECTORY";
    case kFilesBase + 13: // nsError.h
      return "IS_DIRECTORY";
    case kFilesBase + 14: // nsError.h
      return "IS_LOCKED";
    case kFilesBase + 15: // nsError.h
      return "TOO_BIG";
    case kNoDeviceSpace:
      return "NO_DEVICE_SPACE";
    case kNameTooLong:
      return "NAME_TOO_LONG";
    case kFileNotFound:
      return "FILE_NOT_FOUND";
    case kFilesBase + 19: // nsError.h
      return "READ_ONLY";
    case kFilesBase + 20: // nsError.h
      return "DIR_NOT_EMPTY";
    case kAccessDenied:
      return "ACCESS_DENIED";
    default:
      for (a in Components.results)
        if (Components.results[a] == aStatusCode)
          return a;
      return String(aStatusCode);
  }
}

