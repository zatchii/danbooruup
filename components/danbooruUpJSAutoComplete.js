const DANBOORUUPJSAC_CLASSNAME = "danbooruJSAutoComplete";
const DANBOORUUPJSAC_CONTRACTID = "@mozilla.org/autocomplete/search;1?name=danboorutag";
const DANBOORUUPJSAC_CID = Components.ID("{172802a8-e70c-4316-9ad8-dcade182778a}");

const Cc = Components.classes;
const Ci = Components.interfaces;

var danbooruUpJSAutoCompleteObject = function()
{
	this._tagService = Cc["@unbuffered.info/danbooru/helper-service;1"].getService(Ci.danbooruIHelperService).tagService;
}

danbooruUpJSAutoCompleteObject.prototype = 
{
	startSearch: function(aString, aParam, aPrev, aListener) {
		if(aListener == null)
			return Components.results.NS_ERROR_FAILURE;

		var result = {value:null};
		this._tagService.autoCompleteSearch(aString, aPrev, result);
		aListener.onSearchResult(this, result.value);
		delete result.value;

		return Components.results.NS_OK;
	},
	stopSearch: function() {
		return Components.results.NS_OK;
	},
	QueryInterface: function(aIID) {
		if (!aIID.equals(Ci.nsISupports) &&
			!aIID.equals(Ci.nsIAutoCompleteSearch)) {
			Components.returnCode = Components.results.NS_ERROR_NO_INTERFACE;
			return null;
		}

		return this;
	}
};

// Component registration
const JSACModule = {

	getClassObject: function(aCompMgr, aCID, aIID) {
		if (aCID.equals(DANBOORUUPJSAC_CID)) {
			return JSACFactory;
		}

		Components.returnCode = Components.results.NS_ERROR_NOT_REGISTERED;
		return null;
	},

	registerSelf: function(aCompMgr, aFileSpec, aLocation, aType) {
		aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
		aCompMgr.registerFactoryLocation(DANBOORUUPJSAC_CID, DANBOORUUPJSAC_CLASSNAME, DANBOORUUPJSAC_CONTRACTID, aFileSpec, aLocation, aType);
	},

	unregisterSelf: function(aCompMgr, aLocation, aType) {
		aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
		aCompMgr.unregisterFactoryLocation(DANBOORUUPJSAC_CID, aLocation);
	},

	canUnload: function(aCompMgr) {
		return true;
	}
};

// Returns the singleton object when needed.
const JSACFactory = {

	createInstance: function(outer, iid)
	{
		if (outer != null) {
			Components.returnCode = Components.results.NS_ERROR_NO_AGGREGATION;
			return null;
		}
		return (new danbooruUpJSAutoCompleteObject()).QueryInterface(iid);
	},
	lockFactory: function(aLock) { },

	QueryInterface: function(aIID) {
		if (!aIID.equals(Ci.nsISupports) && !aIID.equals(Ci.nsIModule) &&
			!aIID.equals(Ci.nsIFactory) && !aIID.equals(Ci.nsIAutoCompleteSearch)) {
			Components.returnCode = Components.results.NS_ERROR_NO_INTERFACE;
			return null;
		}

		return this;
	}
};

// XPCOM Registration Function -- called by Firefox
function NSGetModule(compMgr, fileSpec)
{
	return JSACModule;
}

