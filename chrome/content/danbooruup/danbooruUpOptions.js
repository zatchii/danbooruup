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
    for (var i = 0; i < this._danbooru.length; ++i) {
      if (this._danbooru[i].rawHost == host) {
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

    for (var j = 0; j < this._danbooru.length; ++j) {
      if(j == aWhich) {
        this._danbooru[j].selected = true;
      } else if(this._danbooru[j].selected) {
	this._danbooru[j].selected = false;
      }
    }
  },

  getSelectedDanbooru: function ()
  {
    for (var j = 0; j < this._danbooru.length; ++j) {
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

  // load function only for danbooruUpOptions
  onLoad: function ()
  {
    this._bundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService)
		   .createBundle('chrome://danbooruup/locale/danbooruUp.properties');
    this._tree = document.getElementById("danbooruTree");

    this.init(null);

    // sort and display the table
    this._tree.treeBoxObject.view = this._view;
    this.onDanbooruSort("rawHost", false);

    document.getElementById("url").focus();
  },

  // used by danbooruUpBox and Options
  init: function (aMenuList)
  {
    this._loadDanbooru();
    if(aMenuList) {
      for (var j = 0; j < this._danbooru.length; ++j) {
        aMenuList.appendItem(this._danbooru[j].rawHost,0);
      }
      aMenuList.selectedIndex = this.getSelectedDanbooru();
    }
  },

  uninit: function ()
  {
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
		.getService(Components.interfaces.nsIPrefService);
    var pbi = prefs.getBranch('extensions.danbooruUp.');
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
      return false;
    }
    var pbi = Components.classes["@mozilla.org/preferences-service;1"]
	      .getService(Components.interfaces.nsIPrefBranch);
    pbi.setCharPref("extensions.danbooruUp.tooltipcrop", document.getElementById("cropGroup").value);

    this._saveDanbooru();
    this.uninit();
    //var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
    //os.notifyObservers(null, "danbooru-options-changed", null);
    return true;
  },

  onDanbooruSelected: function ()
  {
    var hasSelection = this._tree.view.selection.count > 0;
    var hasRows = this._tree.view.rowCount > 0;
    document.getElementById("removeHost").disabled = !hasRows || !hasSelection;
  },

  onDanbooruDeleted: function ()
  {
    if (this._view.rowCount) {
      var removedDanbooru = [];
      this.deleteSelectedItems(this._tree, this._view, this._danbooru, removedDanbooru);
    }
    var hasSelection = this._tree.view.selection.count > 0;
    document.getElementById("removeHost").disabled = (!this._danbooru.length) || (this._tree.view.selection.count < 1);
  },

  onDanbooruKeyPress: function (aEvent)
  {
    if (aEvent.keyCode == 46)
      this.onDanbooruDeleted();
  },

  _lastDanbooruSortColumn: "",
  _lastDanbooruSortAscending: false,

  onDanbooruSort: function (aColumn)
  {
    this._lastDanbooruSortAscending = this.sort(this._tree, 
		    this._view, 
		    this._danbooru,
		    aColumn, 
		    this._lastDanbooruSortColumn, 
		    this._lastDanbooruSortAscending);
    this._lastDanbooruSortColumn = aColumn;
  },

  deleteSelectedItems: function (aTree, aView, aItems, aDeletedItems)
  {
    var selection = aTree.view.selection;
    selection.selectEventsSuppressed = true;
    
    var rc = selection.getRangeCount();
    for (var i = 0; i < rc; ++i) {
      var min = { }; var max = { };
      selection.getRangeAt(i, min, max);
      for (var j = min.value; j <= max.value; ++j) {
        aDeletedItems.push(aItems[j]);
        aItems[j] = null;
      }
    }
    
    var nextSelection = 0;
    for (i = 0; i < aItems.length; ++i) {
      if (!aItems[i]) {
        var j = i;
        while (j < aItems.length && !aItems[j])
          ++j;
        aItems.splice(i, j - i);
        nextSelection = j < aView.rowCount ? j - 1 : j - 2;
        aView._rowCount -= j - i;
        aTree.treeBoxObject.rowCountChanged(i, i - j);
      }
    }

    if (aItems.length) {
      selection.select(nextSelection);
      aTree.treeBoxObject.ensureRowIsVisible(nextSelection);
      aTree.focus();
    }
    selection.selectEventsSuppressed = false;
  },

  sort: function (aTree, aView, aDataSet, aColumn, 
			aLastSortColumn, aLastSortAscending) 
  {
    var ascending = (aColumn == aLastSortColumn) ? !aLastSortAscending : true;
    aDataSet.sort(function (a, b) { return a[aColumn].toLowerCase().localeCompare(b[aColumn].toLowerCase()); });
    if (!ascending)
      aDataSet.reverse();
    
    aTree.view.selection.select(-1);
    aTree.view.selection.select(0);
    aTree.treeBoxObject.invalidate();
    aTree.treeBoxObject.ensureRowIsVisible(0);
    
    return ascending;
  },

  onWriteEnableAC: function ()
  {
    var pref = document.getElementById("extensions.danbooruUp.autocomplete.enabled");
    return pref.value;
  },

  onReadEnableAC: function ()
  {
    var pref = document.getElementById("extensions.danbooruUp.autocomplete.enabled");
    this.onEnableACChanged(pref.value);
    return pref.value;
  },

  onEnableACChanged: function (aWhat)
  {
    var pref = document.getElementById("enableAC");
    var elements = [	"updateURL",
			"clearTagHistory",
			"updateNow",
			"updateOnStartup",
			"fastUpdate",
			"updateBeforeDialog",
			"updateAfterDialog",
			"updateOnTimer",
			"updateInterval",];
    for(var e in elements) {
      document.getElementById(elements[e]).disabled = !aWhat;
    }
    if (aWhat) {
      this.onReadUpdateOnStartup();
      this.onReadUpdateOnTimer();
    }
  },

  onWriteUpdateOnStartup: function ()
  {
    var pref = document.getElementById("extensions.danbooruUp.autocomplete.update.onstartup");
    return pref.value;
  },

  onReadUpdateOnStartup: function ()
  {
    var pref = document.getElementById("extensions.danbooruUp.autocomplete.update.onstartup");
    var box = document.getElementById("fastUpdate");
    box.disabled = !pref.value;
    return pref.value;
  },

  onWriteUpdateOnTimer: function ()
  {
    var pref = document.getElementById("extensions.danbooruUp.autocomplete.update.ontimer");
    return pref.value;
  },

  onReadUpdateOnTimer: function ()
  {
    var pref = document.getElementById("extensions.danbooruUp.autocomplete.update.ontimer");
    var box = document.getElementById("updateInterval");
    box.disabled = !pref.value;
    return pref.value;
  },

  changeTooltipCrop: function ()
  {
    var grp = document.getElementById("cropGroup");
    return grp.value;
  },

  _loadDanbooru: function ()
  {
    this._danbooru = [];
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
		.getService(Components.interfaces.nsIPrefService);
    var pbi = prefs.getBranch('extensions.danbooruUp.');
    // this pref is a comma-delimited list of hosts
    var pref = 'postadduri';
    var selpref = 'postadduri.selected';

    // load danbooru into a table
    var count = 0;
    var selhost = '';
    try { var hosts = pbi.getCharPref(pref); } catch(ex) { return; }

    var hostList = hosts.split("`");
    for (var j = 0; j < hostList.length; ++j) {
      // trim leading and trailing spaces
      var host = hostList[j].replace(/^\s*/,"").replace(/\s*$/,"");
      try {
	var uri = ioService.newURI(host, null, null);
        this._addDanbooruToList(uri.spec);
      } catch(ex) {}
    }

    if(this._danbooru.length < 1) {
      var dbranch = prefs.getDefaultBranch('extensions.danbooruup.');
      var uri = ioService.newURI(host, null, null);
      this._addDanbooruToList(uri.spec);
    }
    if(this._danbooru.length < 1) {
      this._addDanbooruToList('http://danbooru.donmai.us/post/list');
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

    this._view._rowCount = this._danbooru.length;

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
    var hlist = [];

    for (var j = 0; j < this._danbooru.length; ++j) {
      hlist.push(this._danbooru[j].rawHost);
    }
    pbi.setCharPref(pref, hlist.join("`"));
  },

  _addDanbooruToList: function (aDanbooru)
  {
    this._danbooru.push(new Danbooru(aDanbooru));
  }
};

