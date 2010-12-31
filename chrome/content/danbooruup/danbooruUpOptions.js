// handles danbooru list preference conversion along with the options dialog
// probably should go into the helper service
// vim:set ts=2 sw=2 et:

function Danbooru(host)
{
	this.rawHost = host;
	this.selected = false;
}

var gDanbooruManager = {
  _danbooru     : [],
  _bundle       : null,
  _tree         : null,

  _view: {
    _rowCount: 0,
    get rowCount()
    {
      return this._rowCount;
    },
    getCellText: function (aRow, aColumn)
    {
      //if (aColumn.id == "siteCol" || aColumn == "siteCol")
        return gDanbooruManager._danbooru[aRow].rawHost;
      //return "";
    },

    isSeparator: function(aIndex) { return false; },
    isSorted: function() { return false; },
    isContainer: function(aIndex) { return false; },
    setTree: function(aTree){},
    getImageSrc: function(aRow, aColumn) {},
    getProgressMode: function(aRow, aColumn) {},
    getCellValue: function(aRow, aColumn) {},
    cycleHeader: function(column) {},
    getRowProperties: function(row,prop){},
    getColumnProperties: function(column,prop){},
    getCellProperties: function(row,column,prop){}
  },

  addDanbooru: function (aCapability)
  {
    var textbox = document.getElementById("url");
    var host = textbox.value.replace(/^\s*([-\w]*:\/+)?/, ""); // trim any leading space and scheme
    if (!host.length) return;

    try {
      var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                                .getService(Components.interfaces.nsIIOService);
      var uri = ioService.newURI("http://"+host, null, null);
      host = uri.spec;
    } catch(ex) {
      var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                    .getService(Components.interfaces.nsIPromptService);
      var message = this._bundle.GetStringFromName("danbooruUp.opt.invalidURI");
      var title = this._bundle.GetStringFromName("danbooruUp.opt.error");
      promptService.alert(window, title, message);
      return;
    }

    // check whether the danbooru already exists, if not, add it
    var exists = false;
    for (let j=0; j<this._danbooru.length; j++) {
      if (this._danbooru[j].rawHost == host) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      this._addDanbooruToList(host);
      ++this._view._rowCount;
      this._tree.treeBoxObject.rowCountChanged(this._view.rowCount - 1, 1);
      // Re-do the sort, since we inserted this new item at the end.
      this.sort(this._tree, this._view, this._danbooru,
		      this._lastDanbooruSortColumn,
		      this._lastDanbooruSortAscending);
    }
    textbox.value = "";
    textbox.focus();

    // covers a case where the site exists already, so the buttons don't disable
    this.onHostInput(textbox);
  },

  selectDanbooru: function (aWhich)
  {
    if (aWhich < 0 || aWhich >= this._danbooru.length) return;

    for (let j = 0; j < this._danbooru.length; ++j) {
      if(j == aWhich) {
        this._danbooru[j].selected = true;
      } else if(this._danbooru[j].selected) {
        this._danbooru[j].selected = false;
      }
    }
  },

  getSelectedDanbooru: function ()
  {
    for (let j = 0; j < this._danbooru.length; ++j) {
      if(this._danbooru[j].selected) {
        return j;
      }
    }
    return 0;
  },

  onHostInput: function (aSiteField)
  {
    document.getElementById("btnAdd").disabled = !aSiteField.value;
  },

  onHostKeyPress: function (aEvent)
  {
    if (aEvent.keyCode == aEvent.DOM_VK_RETURN || aEvent.keyCode == aEvent.DOM_VK_ENTER ) {
      gDanbooruManager.addDanbooru();
      return false;
    }
  },

  onWindowKeyPress: function (aEvent)
  {
    switch (aEvent.keyCode) {
    case aEvent.DOM_VK_ESCAPE:
      close();
    default:
      return true;
    }
  },

  // handles tag update notifications
	observe: function(aSubject, aTopic, aData)
	{
		switch (aTopic) {
		case "danbooru-update-done":
      var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			    .getService(Components.interfaces.nsIPromptService);
      aSubject.QueryInterface(Components.interfaces.nsISupportsPRUint32);
      promptService.alert(window,
            this._bundle.GetStringFromName("danbooruUp.prompt.title"),
            this._bundle.formatStringFromName("danbooruUp.opt.updatedNodes", [aSubject.data], 1));
      break;
		case "danbooru-clear-done":
      var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			    .getService(Components.interfaces.nsIPromptService);
      promptService.alert(window,
            this._bundle.GetStringFromName("danbooruUp.prompt.title"),
            this._bundle.GetStringFromName("danbooruUp.opt.clearedTags"));
      break;
    }
  },

  // load function only for danbooruUpOptions window
  onLoad: function ()
  {
    this._bundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService)
		   .createBundle('chrome://danbooruup/locale/danbooruUp.properties');
    //this._tree = document.getElementById("danbooruTree");

    this.init(null);

    var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
    os.addObserver(this, "danbooru-clear-done", false);

    // we use instantApply as a hack since the helper service reads the prefs directly
    // save these for ondialogcancel
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.");
    this._oldUpdateURI = prefs.getComplexValue("updateuri", Components.interfaces.nsISupportsString).data;

    var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
    var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"].getService(Components.interfaces.nsIVersionComparator);
    this.isFF4 = versionChecker.compare(appInfo.platformVersion, "1.*") > 0;
    if (this.isFF4)
      document.getElementById("threadedSearch").disabled = true;
  },

  // used by danbooruUpBox and Options
  init: function (aMenuList)
  {
    this._loadDanbooru();
    if(aMenuList) {
      for (let j=0; j<this._danbooru.length; j++) {
        aMenuList.appendItem(this._danbooru[j].rawHost,0);
      }
      aMenuList.selectedIndex = this.getSelectedDanbooru();
    }
  },

  // options unload event
  onUnload: function ()
  {
    var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
    os.removeObserver(this, "danbooru-clear-done");

    if (document.documentElement.instantApply)
      this.onOK();

    this.uninit();
  },

  onDialogCancel: function ()
  {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.");
    if (!document.documentElement.instantApply) {
      prefs.setCharPref("updateuri", this._oldUpdateURI);
    }
    return true;
  },

  // not really sure what all this code is for any more
  // updates selected danbooru for upload dialog
  uninit: function ()
  {
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
    var pbi = Components.classes["@mozilla.org/preferences-service;1"]
                		.getService(Components.interfaces.nsIPrefService).getBranch('extensions.danbooruUp.');
    var selpref = 'postadduri.selected';
    var selected = this.getSelectedDanbooru();
    try {
      pbi.setIntPref(selpref, selected);
    } catch(ex) {
      try { // okay, reset it then
        try { pbi.deleteBranch(selpref); } catch (whocares) { }
        pbi.setIntPref(selpref, selected);
      } catch (ex2) { // oh no
        var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			    .getService(Components.interfaces.nsIPromptService);
        var message = this._bundle.GetStringFromName("danbooruUp.opt.prefSaveFailed");
        var title = this._bundle.GetStringFromName("danbooruUp.opt.error");
        promptService.alert(window, title, message);
      }
    }
  },

  // Options OK event
  onOK: function ()
  {
    if(!this._danbooru.length) {
      var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                    .getService(Components.interfaces.nsIPromptService);
      var message = this._bundle.GetStringFromName("danbooruUp.opt.emptyHosts");
      var title = this._bundle.GetStringFromName("danbooruUp.opt.error");
      promptService.alert(window, title, message);
    } else {
      this._saveDanbooru();
    }
    return true;
  },

  // checkbox functions

  readCheckMD5BeforeUpload: function ()
  {
    this.checkMD5BeforeUploadChanged();
    return undefined;
  },

  checkMD5BeforeUploadChanged: function ()
  {
    var pref = document.getElementById("pref.extensions.danbooruUp.checkMD5BeforeUpload");
    var box = document.getElementById("updateTagsOnDuplicate");
    box.disabled = !pref.value;
  },

  _loadDanbooru: function ()
  {
    this._danbooru = [];
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                		.getService(Components.interfaces.nsIPrefService);
    var pbi = prefs.getBranch('extensions.danbooruUp.');
    // this pref is a `-delimited list of hosts
    var pref = 'postadduri';
    var selpref = 'postadduri.selected';

    // load danbooru into a table
    var count = 0;
    var selhost = '';
    try { var hosts = pbi.getComplexValue(pref, Components.interfaces.nsISupportsString).data; } catch(ex) { return; }

    var hostList = hosts.split("`");

    for (let j=0; j<hostList.length; j++) {
      // trim leading and trailing spaces
      var host = hostList[j].replace(/^\s*/,"").replace(/\s*$/,"");
      try {
        var uri = ioService.newURI(host, null, null);
        this._addDanbooruToList(uri.spec);
      } catch(ex) {
        Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService).logStringMessage("Could not add host \""+host+"\" to list: "+ex);
      }
    }

    if(this._danbooru.length < 1) {
      var uri = ioService.newURI(host, null, null);
      this._addDanbooruToList(uri.spec);
    }
    if(this._danbooru.length < 1) {
      pbi.ockPref(pref);
      this._addDanbooruToList(pbi.getComplexValue(pref, Components.interfaces.nsISupportsString)).data;
      pbi.unlockPref(pref);
    }
    if(this._danbooru.length < 1) {
      var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                    .getService(Components.interfaces.nsIPromptService);
      var message = this._bundle.GetStringFromName("danbooruUp.opt.hostAddFailed");
      var title = this._bundle.GetStringFromName("danbooruUp.opt.error");
      throw message;
      promptService.alert(window, title, message);
      return;
    }

    var selhost = null;
    try {
      selhost = pbi.getIntPref(selpref);
    } catch(ex) { }
    this.selectDanbooru(selhost);
  },

  _saveDanbooru: function ()
  {
    var pbi = Components.classes["@mozilla.org/preferences-service;1"]
	      .getService(Components.interfaces.nsIPrefBranch);
    var pref = "extensions.danbooruUp.postadduri";

    var str = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
    str.data = [h.rawHost for each(h in this._danbooru)].join("`");

    pbi.setComplexValue(pref, Components.interfaces.nsISupportsString, str);
  },

  _addDanbooruToList: function (aDanbooru)
  {
    this._danbooru.push(new Danbooru(aDanbooru));
  }
};
