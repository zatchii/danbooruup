// This is a list of ids to elements of the following type: radiogroup, textbox, 
// checkbox, menulist that can be prefilled automatically from preferences (default
// or user) by the Options dialog's framework. To benefit from this prefilling each
// checkbox etc that you use should be annotated with the pref identifier that 
// it is tied to, the type of pref, and a unique id, which is added to this array.
//
// e.g for this XUL element:
//
// <checkbox id="showSampleWindow" label="Show Sample Window"
//           preftype="bool" prefstring="sample.options.showSampleWindow"/>
//
// _elementIDs would look like this:
//
// var _elementIDs = ["showSampleWindow"];
//
//var _elementIDs = [];

// This function is called before the dialog is shown, and before the preferences
// auto-filling code has initialized the state of any of the UI elements in this
// dialog. Thus it is not possible to do enabling or disabling at this point since
// you won't correctly know the state of your UI.
//function onLoad()
//{
  // We ask the parent dialog (which is the Firebird Options dialog) to initialize
  // this by using the preferences auto-prefill code.
  //window.opener.top.initPanel(window.location.href, window);  
//}

// This is a special function that is called by the preferences auto-prefilling code
// AFTER all of the UI elements defined in _elementIDs above have been prefilled from
// the user or default preferences. You can execute code in this method that enables
// or disables elements based on the state of various UI elements, since their state
// has already been established. 
//function Startup()
//{
  // Enabling code can execute here. 
//}

// The user pressed the OK button on the dialog. 
//function onOK()
//{
  // Tell the preferences framework to save the user's modifications for this 
  // panel, but don't actually save them to disk until the user presses "OK" in
  // the master Options dialog. 
  //window.opener.top.hPrefWindow.wsm.savePageData(window.location.href, window);

  // Dialog OK handlers must return true. 
//  return true;
//}

// Any specialized enabling code and code for other UI controls in the options dialog
// goes here. 

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
      if (aColumn.id == "siteCol")
        return gDanbooruManager._danbooru[aRow].rawHost;
      return "";
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
      gTreeUtils.sort(this._tree, this._view, this._danbooru,
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
    if (aEvent.keyCode == 13)
      gDanbooruManager.addDanbooru();
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
    this._saveDanbooru();
    this.uninit();
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
      gTreeUtils.deleteSelectedItems(this._tree, this._view, this._danbooru, removedDanbooru);
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
    this._lastDanbooruSortAscending = gTreeUtils.sort(this._tree, 
                                                        this._view, 
                                                        this._danbooru,
                                                        aColumn, 
                                                        this._lastDanbooruSortColumn, 
                                                        this._lastDanbooruSortAscending);
    this._lastDanbooruSortColumn = aColumn;
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

    hostList = hosts.split("`");
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
  },
};

