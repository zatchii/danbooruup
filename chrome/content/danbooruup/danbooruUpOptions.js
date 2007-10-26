// handles danbooru list preference conversion along with the options dialog
// vim:set ts=2 sw=2 et:

const TAGTYPE_COUNT = 5;

var atomSvc = Components.classes["@mozilla.org/atom-service;1"].getService(Components.interfaces.nsIAtomService);

function Danbooru(host)
{
	this.rawHost = host;
	this.selected = false;
}

function DanbooruTagView()
{
  this.rows = 0;
  this.tree = null;
  this.data = new Array;
  this.selection = null;
}
DanbooruTagView.prototype = {
  sid: 0,

  set rowCount(c) { throw "rowCount is a readonly property"; },
  get rowCount() { return this.rows; },

  setTree: function(tree)
  {
    this.tree = tree;
  },

  getCellText: function(row, column)
  {
    return this.data[row][column.index] || "";
  },

  setCellValue: function(row, column, value)
  {
  },

  setCellText: function(row, column, value)
  {
    this.data[row][column.index] = value;
  },

  addRow: function(row)
  {
    this.rows = this.data.push(row);
    this.rowCountChanged(this.rows - 1, 1);
  },

  addRows: function(rows)
  {
    var length = rows.length;
    for(var i = 0; i < length; i++)
      this.rows = this.data.push(rows[i]);
    this.rowCountChanged(this.rows - length, length);
  },

  rowCountChanged: function(index, count)
  {
    this.tree.rowCountChanged(index, count);
  },

  invalidate: function()
  {
    this.tree.invalidate();
  },

  clear: function()
  {
    this.data = new Array;
    this.rows = 0;
  },

  handleCopy: function(row)
  {
    return (row < 0 || this.copycol < 0) ? "" : (this.data[row][this.copycol] || "");
  },

  performActionOnRow: function(action, row)
  {
    if (action == "copy")
    {
      var data = this.handleCopy(row)
      this.tree.treeBody.parentNode.setAttribute("copybuffer", data);
    }
  },
  getRowProperties: function(row, prop) { },
  getCellProperties: function(row, column, prop) {
    prop.AppendElement(atomSvc.getAtom("danbooru-tag-type-"+row+"-sid"+this.sid));
/*
    en = prop.Enumerate();n=0;
    p='';
    while(!en.isDone())
    {
      x=en.currentItem();
      p += x.QueryInterface(Components.interfaces.nsIAtom).toString() + "\n";
      try { en.next(); } catch (ex) { break; }
    }
    Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService).
      logStringMessage(p);
*/
  },
  getColumnProperties: function(column, prop) { },
  isContainer: function(index) { return false; },
  isContainerOpen: function(index) { return false; },
  isSeparator: function(index) { return false; },
  isSorted: function() { },
  canDrop: function(index, orientation) { return false; },
  drop: function(row, orientation) { return false; },
  getParentIndex: function(index) { return 0; },
  hasNextSibling: function(index, after) { return false; },
  getLevel: function(index) { return 0; },
  getImageSrc: function(row, column) { },
  getProgressMode: function(row, column) { },
  getCellValue: function(row, column) { },
  toggleOpenState: function(index) { },
  cycleHeader: function(col) { },
  selectionChanged: function() { },
  cycleCell: function(row, column) { },
  isEditable: function(row, column) { return false; },
  isSelectable: function(row, column) { return false; },
  performAction: function(action) { },
  performActionOnCell: function(action, row, column) { }
};

var gDanbooruManager = {
  _danbooru     : [],
  _styles       : [],
  _bundle       : null,
  _tree         : null,
  _tagView      : null,

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

  clearTagHistory: function ()
  {
    var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			    .getService(Components.interfaces.nsIPromptService);
    if (promptService.confirm(window,
          this._bundle.GetStringFromName("danbooruUp.prompt.title"),
          this._bundle.GetStringFromName("danbooruUp.msg.clearconfirm")))
      Components.classes['@unbuffered.info/danbooru/helper-service;1'].getService(Components.interfaces.danbooruIHelperService).tagService.removeAllEntries();
  },

  // opens download progress window
  openDownloader: function (aAction)
  {
    window.openDialog("chrome://danbooruup/content/danbooruUpDown.xul", "danbooruUpDown", "centerscreen,chrome,dialog=yes,modal=yes,close=no", {action:aAction});
  },

  // tag type stuff

  // serial for tag popup preview needs to be incremented, since fiddling with the rules via DOM doesn't actually
  // change anything in gecko 1.8
  getSID: function ()
  {
    if(this._tagView) return this._tagView.sid;
    return 0;
  },
  invalidateTagTree: function ()
  {
    // invalidate tends to not redraw if the tree isn't focused
    if(this._tagView) {
      this._tagView.tree.focused = !this._tagView.tree.focused;
      this._tagView.tree.invalidate();
      setTimeout(function() {
          gDanbooruManager._tagView.tree.focused = !gDanbooruManager._tagView.tree.focused;
          gDanbooruManager._tagView.tree.invalidate();
        }, 0);
    }
  },
  // listbox style selection changed
  tagTypeSelected: function (evt)
  {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.tagtype.");
    var tt = document.getElementById("tagType");
    // save style to array, and to pref as well if instant apply is active
    gDanbooruManager._styles[tt.oldvalue] = document.getElementById("styleBox").value;
    if (document.documentElement.instantApply && tt.oldvalue) {
      try { prefs.setCharPref(tt.oldvalue, document.getElementById("styleBox").value); }
      catch (e) { }
    }

    document.getElementById("styleBox").value = gDanbooruManager._styles[tt.value];
    tt.oldvalue = tt.value;
    return true;
  },
  revertStyle: function ()
  {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.tagtype.");
    var tt = document.getElementById("tagType");

    var oldstyle = prefs.getCharPref(tt.value);
    // throws if there is no user value
    try { prefs.clearUserPref(tt.value); } catch(ex) { }
    var style = prefs.getCharPref(tt.value);

    // don't actually clear the old value
    if (!document.documentElement.instantApply)
      prefs.setCharPref(tt.value, oldstyle);

    gDanbooruManager._styles[tt.value] = style;
    document.getElementById("styleBox").value = style;
  },
  applyStyle: function ()
  {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.tagtype.");
    var styleName = document.getElementById("tagType").value;
    var styleText = document.getElementById("styleBox").value;

    if (document.documentElement.instantApply)
      prefs.setCharPref(styleName, styleText);

    gDanbooruManager._styles[styleName] = styleText;
    this._tagView.sid++;
    danbooruAddTagTypeStyleSheet();
  },

  // load function only for danbooruUpOptions window
  onLoad: function ()
  {
    this._bundle = Components.classes['@mozilla.org/intl/stringbundle;1'].getService(Components.interfaces.nsIStringBundleService)
		   .createBundle('chrome://danbooruup/locale/danbooruUp.properties');
    this._tree = document.getElementById("danbooruTree");

    this.init(null);

    var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
    os.addObserver(this, "danbooru-clear-done", false);

    // sort and display the table
    this._tree.treeBoxObject.view = this._view;
    this.onDanbooruSort("rawHost", false);

    var tagTypes = document.getElementById("tagType");
    var tagTree = document.getElementById("tagTree");
    var tagPrefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.tagtype.");

    // we use instantApply as a hack since the helper service reads the prefs directly 
    // save these for ondialogcancel
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("extensions.danbooruUp.");
    this._oldUpdateURI = prefs.getComplexValue("updateuri", Components.interfaces.nsISupportsString).data;
    this._oldRelatedUpdateURI = prefs.getComplexValue("relatedupdateuri", Components.interfaces.nsISupportsString).data;

    document.getElementById("tagTreeBox").onPopupClick = function()
    {
      var tagTypes = document.getElementById("tagType");
      var tagTree = document.getElementById("tagTree");
      var row = tagTree.currentIndex;
      var type = tagTree.view.getCellText(row,{index:0});
      if(tagTypes.label == type)
      {
        tagTypes.selectedIndex++;
      } else if (tagTypes.label.match(new RegExp("^"+type+"$"))) {
        tagTypes.selectedIndex--;
      } else {
        tagTypes.selectedIndex = row * 2;
      }
    };

    this._tagView = new DanbooruTagView();
    tagTree.treeBoxObject.view = this._tagView;
    tagTree.setAttribute("hidescrollbar", true);
    for (var i=0, pn; i<TAGTYPE_COUNT; i++) {
      pn = this._bundle.GetStringFromName("danbooruUp.tagType."+i);
      this._tagView.addRow([pn]);

      tagTypes.appendItem(pn, i);
      this._styles[i] = tagPrefs.getCharPref(i);
      tagTypes.appendItem(this._bundle.GetStringFromName("danbooruUp.tagType."+i+".selected"), i+".selected");
      this._styles[i+".selected"] = tagPrefs.getCharPref(i+".selected");
    }

    tagTypes.addEventListener("ValueChange", gDanbooruManager.tagTypeSelected, false);
    tagTypes.selectedIndex = 0;
    danbooruAddTagTypeStyleSheet();
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
    prefs.setCharPref("updateuri", this._oldUpdateURI);
    prefs.setCharPref("relatedupdateuri", this._oldRelatedUpdateURI);
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

    var pbi = Components.classes["@mozilla.org/preferences-service;1"]
	      .getService(Components.interfaces.nsIPrefBranch);
    pbi.setCharPref("extensions.danbooruUp.tooltipcrop", document.getElementById("cropGroup").value);

    var sbranch = pbi.getBranch("extensions.danbooruUp.tagtype.");
    for(var i=0; i<TAGTYPE_COUNT; i++)
    {
      sbranch.setCharPref(i, this._styles[i]);
      sbranch.setCharPref(i+".selected", this._styles[i+".selected"]);
    }

    //var os=Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
    //os.notifyObservers(null, "danbooru-options-changed", null);
    return true;
  },

  // site list functions
  onDanbooruSelected: function ()
  {
    var hasSelection = this._tree.view.selection.count > 0;
    var hasRows = this._tree.view.rowCount > 0;
    document.getElementById("btnRemoveHost").disabled = !hasRows || !hasSelection;
  },

  onDanbooruDeleted: function ()
  {
    if (this._view.rowCount) {
      var removedDanbooru = [];
      this.deleteSelectedItems(this._tree, this._view, this._danbooru, removedDanbooru);
    }
    var hasSelection = this._tree.view.selection.count > 0;
    document.getElementById("btnRemoveHost").disabled = (!this._danbooru.length) || (this._tree.view.selection.count < 1);
  },

  onDanbooruKeyPress: function (aEvent)
  {
    if (aEvent.keyCode == aEvent.DOM_VK_DELETE)
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

  // checkbox functions
  onWriteEnableAC: function ()
  {
    var pref = document.getElementById("pref.extensions.danbooruUp.autocomplete.enabled");
    return pref.value;
  },

  onReadEnableAC: function ()
  {
    var pref = document.getElementById("pref.extensions.danbooruUp.autocomplete.enabled");
    this.onEnableACChanged(pref.value);
    return pref.value;
  },

  onEnableACChanged: function (aWhat)
  {
    var pref = document.getElementById("enableAC");
    var elements = [	"enableSiteAC",
			"updateURL",
			"clearTagHistory",
			"updateNow",
			"updateOnStartup",
			"fastUpdate",
			"updateBeforeDialog",
			"updateAfterDialog",
			"updateOnTimer",
			"updateInterval",];
    for (let i=0; i<elements.length; i++) {
      document.getElementById(elements[i]).disabled = !aWhat;
    }
    if (aWhat) {
      this.onReadUpdateOnStartup();
      this.onReadUpdateOnTimer();
    }
  },

  onWriteUpdateOnStartup: function ()
  {
    var pref = document.getElementById("pref.extensions.danbooruUp.autocomplete.update.onstartup");
    return pref.value;
  },

  onReadUpdateOnStartup: function ()
  {
    var pref = document.getElementById("pref.extensions.danbooruUp.autocomplete.update.onstartup");
    var box = document.getElementById("fastUpdate");
    box.disabled = !pref.value;
    return pref.value;
  },

  onWriteUpdateOnTimer: function ()
  {
    var pref = document.getElementById("pref.extensions.danbooruUp.autocomplete.update.ontimer");
    return pref.value;
  },

  onReadUpdateOnTimer: function ()
  {
    var pref = document.getElementById("pref.extensions.danbooruUp.autocomplete.update.ontimer");
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

    var str = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
    str.data = [h.rawHost for each(h in this._danbooru)].join("`");

    pbi.setComplexValue(pref, Components.interfaces.nsISupportsString, str);
  },

  _addDanbooruToList: function (aDanbooru)
  {
    this._danbooru.push(new Danbooru(aDanbooru));
  }
};

