const DANBOORU_TAGHISTORYSERVICE_CONTRACTID = '@unbuffered.info/danbooru/taghistory-service;1';
const DANBOORU_TAGHISTORYSERVICE_CID = Components.ID('{4d39eff7-397a-4a14-be57-b5e472760ecd}');

// SQL statements and constants
const kSetCollate = 'PRAGMA case_sensitive_like = true';
const kTagHistoryFileName = 'danbooruhistory_z.sqlite';
const kTagTableName = 'tag';
const kTagTableSchema = 'tag_id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, tag_count INTEGER NOT NULL DEFAULT 0, tag_type INTEGER NOT NULL DEFAULT 0, ambiguous INTEGER NOT NULL DEFAULT 0';
const kTagTableCreate = 'CREATE TABLE IF NOT EXISTS tag(tag_id INTEGER PRIMARY KEY, tag_name TEXT NOT NULL UNIQUE, tag_count INTEGER NOT NULL DEFAULT 0, tag_type INTEGER NOT NULL DEFAULT 0, ambiguous INTEGER NOT NULL DEFAULT 0)';
const kTagInsert = 'INSERT OR IGNORE INTO tag(tag_id, tag_name, tag_count, tag_type, ambiguous) VALUES(?1, ?2, ?3, ?4, ?5)';
const kTagLookup = 'SELECT tag_id, tag_type, ambiguous FROM tag WHERE tag_name = ?1';
const kTagGetIds = 'SELECT tag_id FROM tag WHERE tag_name in (%%%)';

const kTagHistoryMaxItems = 10000;
const kTagHistoryName = 'tag_history';
const kTagHistorySchema = 'th_id INTEGER PRIMARY KEY, tag_id INTEGER NOT NULL, ctx_id INTEGER NOT NULL';
const kTagHistoryCreate = 'CREATE TABLE IF NOT EXISTS tag_history(th_id INTEGER PRIMARY KEY, tag_id INTEGER NOT NULL, ctx_id INTEGER NOT NULL)';
const kTagContextName = 'tag_context';
const kTagContextSchema = 'ctx_id INTEGER PRIMARY KEY, context TEXT NOT NULL UNIQUE, weight REAL DEFAULT 1';
const kTagContextCreate = 'CREATE TABLE IF NOT EXISTS tag_context(ctx_id INTEGER PRIMARY KEY, context TEXT NOT NULL UNIQUE, weight REAL DEFAULT 1)';
const kTagHistoryInsert = 'INSERT INTO tag_history(ctx_id, tag_id) VALUES(?1, ?2)';
const kTagContextInsert = 'INSERT OR IGNORE INTO tag_context(context) VALUES(?1)';
const kTagContextGetIds = 'SELECT ctx_id FROM tag_context WHERE context in (%%%)';
const kTrimHistory = 'DELETE FROM tag_history WHERE th_id in (SELECT th_id FROM tag_history ORDER BY th_id LIMIT (SELECT max(0, count() - ?1) FROM tag_history))';
const kUpdateContextWeights = 'UPDATE tag_context SET weight = 1.0 / (SELECT count() from tag_history WHERE tag_history.ctx_id = tag_context.ctx_id)';
const kTrimContexts = 'DELETE FROM tag_context WHERE weight is NULL';
const kHistorySearch = 'SELECT tag_name, tag_type, ambiguous FROM tag JOIN tag_history USING (tag_id) JOIN tag_context USING (ctx_id) ' +
			"WHERE tag_name LIKE ?1 ESCAPE '\\' AND context in (%%%) GROUP BY tag_id ORDER BY SUM(weight) DESC, tag_count, tag_name LIMIT ?";

const kTagSearch = "SELECT tag_name, tag_type, ambiguous FROM tag WHERE tag_name LIKE ?1 ESCAPE '\\' ORDER BY tag_count DESC, tag_name ASC LIMIT ?2";
// const kTagSearchAlt = "SELECT tag_name, tag_type FROM tag WHERE tag_name LIKE ?1 ESCAPE '\\' ORDER BY value DESC, LENGTH(tag_name) ASC, tag_name ASC LIMIT ?2";

const kRemoveAll = 'DELETE FROM tag';
const kDeleteContext = 'DELETE FROM tag_context';
const kDeleteHistory = 'DELETE FROM tag_history';
const kMaxID = 'SELECT max(tag_id) FROM tag';
const kRowCount = 'SELECT count() FROM tag';



const Cc = Components.classes;
const Ci = Components.interfaces;
const prefService	= Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService);
const observerService	= Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
const threadManager	= Cc['@mozilla.org/thread-manager;1'].getService(Ci.nsIThreadManager);

function __log(msg)
{
	if (threadManager.isMainThread)
		Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService).logStringMessage(msg);
	else
		threadManager.mainThread.dispatch({run: function() { __log('fo ' + msg); }}, threadManager.mainThread.DISPATCH_NORMAL);
	return msg;
}

const bgThread = threadManager.newThread(0);

function bgDispatch(fun, callback)
{
	var n_callback = function() {
		var args = arguments;
		threadManager.mainThread.dispatch({ run: function() {callback.apply(null, args);} }, threadManager.mainThread.DISPATCH_NORMAL);
	}
	bgThread.dispatch({ run: function() { fun(n_callback); } }, bgThread.DISPATCH_NORMAL);
}

// Kind of pointless ATM... Considered making all db access from same thread.
function bgDispatchSync(fun)
{
	var r = {};
	bgThread.dispatch({ run: function() { r.result = fun(); } }, bgThread.DISPATCH_SYNC);
	return r.result;
}

// Testing.
var dummyDb = {
	df: function() {},
	sdf: function()
	{
		for (var i = 0; i < 5000; i++)
			;
	},
	createStatement: function()
	{
		return { executeStep: this.sdf, bindStringParameter: this.df, bindInt32Parameter: this.df, reset: this.df, finalize: this.df,
		getInt32: function() {return 42;}, getString: function() {return 'asdf';} };
	},
	executeSimpleSQL: function() { this.sdf(); },
	beginTransaction: function() { },
	commitTransaction: function() { },
	rollbackTransaction: function() { }
}

// Surely this exists already somewhere?
var supsInt32 = function(data)
{
	this.data = data;
};

supsInt32.prototype = {
	QueryInterface: function(iid)
	{
		if (iid.equals(Ci.nsISupportsPRUint32) || iid.equals(Ci.nsISupports))
			return this;
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	getInterfaces: function getInterfaces(aCount)
	{
		var ifs = [Ci.nsISupports, Ci.nsISupportsPRUint32];
		aCount.value = ifs.length;
		return ifs;
	}
};

var tagHistoryService = {
	_db: null,
	_acPrefs: prefService.getBranch('extensions.danbooruUp.autocomplete.'),
	_dbBusy: false,	// Not quite a mutex...

	get db()
	{
		if (!this._db) {
			var file = Cc["@mozilla.org/file/directory_service;1"]
				.getService(Ci.nsIProperties)
				.get("ProfD", Ci.nsIFile);
			file.append(kTagHistoryFileName);

			var storageService = Cc["@mozilla.org/storage/service;1"]
				.getService(Ci.mozIStorageService);
			this._db = storageService.openDatabase(file);

			this.setUpTables();
		}
		// this._db = dummyDb;
		return this._db;
	},

	dbGetSimple: function(statement, method)
	{
		var db = this.db;
		return bgDispatchSync(
			function() {
				var stmt = db.createStatement(statement);
				try {
					stmt.executeStep();
					var res = stmt[method](0);
				} finally {
					stmt.finalize();
				}
				return res;
			}
		);
	},

	setUpTables: function()
	{
		var db = this.db;
		db.executeSimpleSQL(kTagTableCreate + ';' + kTagHistoryCreate + ';' + kTagContextCreate + ';' + kSetCollate);
		db.schemaVersion = 1;
	},

	get rowCount()
	{
		var res = this.dbGetSimple(kRowCount, 'getInt32')
		return res;
	},

	get maxID()
	{
		var res = this.dbGetSimple(kMaxID, 'getInt32')
		return res;
	},

	searchRelatedTags: function(tag, callback)
	{
		var uri = prefService.getBranch('extensions.danbooruUp.').getComplexValue('updateuri', Ci.nsISupportsString).data
			.replace(/\/[^/]+\/[^/]+$/, '/tag/related.xml');
		uri += '?tags=' + encodeURIComponent(tag);

		var request = Cc['@mozilla.org/xmlextras/xmlhttprequest;1']
			.createInstance(Ci.nsIXMLHttpRequest);
		request.open('GET', uri);

		var o = this;
		request.addEventListener('load',
			function(event) {
				if (this.status == 200) {
					var tags = [];
					var el = this.responseXML.documentElement.firstChild;
					while (el.nodeType != 1)
						el = el.nextSibling;
					for (var node = el.firstChild; node; node = node.nextSibling) {
						if (node.nodeType != 1)
							continue;
						tags.push(node.getAttribute('name'));
					}

					callback.handleSearchResult(tag, o.enhanceTags(tags));
				} else {
					__log('Got status ' + this.status + ' from artist search.');
				}
			},
			false
		);
		request.send(null);
	},

	// Add tag types from database to a plain array of tag names.
	enhanceTags: function(tags)
	{
		var richtags = [];
		var stmt = this.db.createStatement(kTagLookup);
		try {
			for (var i = 0; i < tags.length; i++) {
				stmt.bindStringParameter(0, tags[i]);
				stmt.executeStep();
				richtags.push([tags[i], stmt.getInt32(1), stmt.getInt32(2)]);
				stmt.reset();
			}
		} finally {
			stmt.finalize();
		}
		return richtags;
	},

	autocompleteSearch: function(query, context, callback)
	{
		var db = this.db;
		var limit = this._acPrefs.getIntPref('limit');
		var alternate = this._acPrefs.getBoolPref('altsearch');
		if (this._acPrefs.getBoolPref('threaded')) {
			bgDispatch(
				function(cb) { tagHistoryService.searchTags(query, context, limit, alternate, db, cb); },
				callback.handleSearchResult
			);
		} else {
			this.searchTags(query, context, limit, alternate, db, callback.handleSearchResult);
		}
	},

	clearTags: function()
	{
		this.db.executeSimpleSQL(kRemoveAll);
	},

	clearHistory: function()
	{
		this.db.executeSimpleSQL(kDeleteHistory + ';' + kDeleteContext);
	},

	// Expand a sql statement by replacing '%%%' with a given amount of comma delimited '?' marks.
	expandQuery: function(query, length)
	{
		var p = Array(length).join('?, ') + (length > 0 ? '?' : '');
		return query.replace(/%%%/, p);
	},

	// Transform a query string to alternate search form. (*a*b*c*)
	alternateQuery: function(query)
	{
		if (query.indexOf('*') != -1) {
			return query;
		}
		return '*' + query.split(/(?:)/).join('*') + (query ? '*' : ''); // bob -> *b*o*b*
	},

	// Search for tags matching the query, placing tags previously used in the given context first.
	searchTags: function(query, context, limit, alternate, db, callback)
	{
		var res = [];
		var seen = {};

		query = query.toLowerCase();
		if (alternate)
			query = this.alternateQuery(query);
		else if (query.indexOf('*') == -1)
			query += '*';

		//var time1 = (new Date()).getTime();

		// First get recently used tags.
		var stmt = db.createStatement(this.expandQuery(kHistorySearch, context.length));
		try {
			query = stmt.escapeStringForLIKE(query, '\\');
			query = query.replace(/\*/g, '%');
			stmt.bindStringParameter(0, query);
			for (var i = 1; i <= context.length; i++)
				stmt.bindStringParameter(i, context[i - 1]);
			stmt.bindInt32Parameter(context.length + 1, limit);

			while (stmt.executeStep()) {
				res.push([stmt.getString(0), stmt.getInt32(1), stmt.getInt32(2)]);
				seen[stmt.getString(0)] = true;
			}
		} finally {
			stmt.finalize();
		}
		// var time2 = (new Date()).getTime();

		// Then fill up with normal results.
		stmt = db.createStatement(kTagSearch);
		try {
			stmt.bindStringParameter(0, query);
			stmt.bindInt32Parameter(1, limit);
			while (res.length < limit && stmt.executeStep()) {
				if (!seen[stmt.getString(0)])
					res.push([stmt.getString(0), stmt.getInt32(1), stmt.getInt32(2)]);
			}
		} finally {
			stmt.finalize();
		}
		// var time3 = (new Date()).getTime();

		/* dump('\nq1 used ');
		dump(time2 - time1);
		dump('\nq2 used ');
		dump(time3 - time2);
		*/

		callback('', res);
	},

	updateTagListFromURI: function(uri, notification)
	{
		if (this._dbBusy || !this._acPrefs.getBoolPref('enabled'))
			throw {result: Components.results.NS_ERROR_NOT_AVAILABLE};
		this._dbBusy = true;

		// XMLHttpRequest seems reluctant to participate in any form of threading.
		var request = Components.classes['@mozilla.org/xmlextras/xmlhttprequest;1']
			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		request.open('GET', uri);

		if (notification) {
			request.channel.notificationCallbacks = notification;
			request.addEventListener('load', notification, false);
			request.addEventListener('error', notification, false);
		}

		request.setRequestHeader('connection', 'close');

		var isLocal = /^file:\/\//.test(uri);

		var db = this.db;
		request.addEventListener('load', function(event) {
				if ((isLocal || this.status == 200) && this.responseXML.documentElement.tagName == 'tags') {
					var xml = this.responseXML;
					tagHistoryService.updateTagListFromXML(xml, db, notification);

				} else {
					observerService.notifyObservers(this, 'danbooru-update-failed', null);
					tagHistoryService._dbBusy = false;
				}
			}, false);

		request.addEventListener('error', function(event) {
				tagHistoryService._dbBusy = false;
				__log('Tag update failed,  ');
			}, false);

		request.send(null);

	},

	updateTagListFromXML: function(xmlDom, db, progressSink)
	{
		var thread = threadManager.currentThread;
		var rootEl = xmlDom.documentElement;
		var nnodes = rootEl.childNodes.length;
		var stmt = db.createStatement(kTagInsert);
		db.beginTransaction();
		var tagCount = 0;
		var i = 0;
		// var time = (new Date()).getTime();
		try {
			for (var node = rootEl.firstChild; node; node = node.nextSibling) {
				i++;
				if (node.nodeType != 1)
					continue;
				stmt.bindInt32Parameter(0, node.getAttribute('id'));
				stmt.bindStringParameter(1, node.getAttribute('name'));
				stmt.bindInt32Parameter(2, node.getAttribute('count'));
				stmt.bindInt32Parameter(3, node.getAttribute('type'));
				stmt.bindInt32Parameter(4, node.getAttribute('ambiguous') == 'true');
				stmt.executeStep();
				stmt.reset();
				if ((++tagCount & 255) === 0) {
					while (thread.hasPendingEvents()) {
						thread.processNextEvent(false);
					}
					if (progressSink)
						progressSink.onProgress(null, null, i, nnodes);
				}
			}
			db.commitTransaction();
			if (progressSink)
				progressSink.onProgress(null, null, i, nnodes);
		} catch (e) {
			db.rollbackTransaction();
			throw e;
		} finally {
			stmt.finalize();
			this._dbBusy = false;
			// __log('Insert time ');
			// __log((new Date()).getTime() - time);
			observerService.notifyObservers(new supsInt32(tagCount), 'danbooru-update-done', null);
		}
	},

	updateTagHistory: function(tags, context)
	{
		if (!this._acPrefs.getBoolPref('keephistory'))
			return;
		// Eliminate duplicates.
		var tagdict = {};
		var tagcount = 0;
		var ctxdict = {};
		var ctxcount = 0;
		var i;

		for (i = 0; i < tags.length; i++) {
			let t = tags[i].toLowerCase();
			if (!(t in tagdict)) {
				tagdict[t] = t;
				tagcount++;
			}
		}
		for (i = 0; i < context.length; i++) {
			if (!(context[i] in ctxdict)) {
				ctxdict[context[i]] = context[i];
				ctxcount++;
			}
		}

		if (ctxcount == 0 || tagcount == 0)
			return true;

		var db = this.db;
		db.beginTransaction();
		try {
			// Insert all contexts
			var stmt = db.createStatement(kTagContextInsert);
			for (context in ctxdict) {
				stmt.bindStringParameter(0, context);
				stmt.executeStep();
				stmt.reset();
			}
			stmt.finalize();

			// Get ids for contexts
			contextIds = [];
			stmt = db.createStatement(this.expandQuery(kTagContextGetIds, ctxcount));
			i = 0;
			for (ctx in ctxdict)
				stmt.bindStringParameter(i++, ctx);
			while (stmt.executeStep())
				contextIds.push(stmt.getInt32(0));
			stmt.finalize();

			// Get ids for tags
			tagIds = [];
			stmt = db.createStatement(this.expandQuery(kTagGetIds, tagcount));
			i = 0;
			for (tag in tagdict)
				stmt.bindStringParameter(i++, tag);
			while (stmt.executeStep())
				tagIds.push(stmt.getInt32(0));
			stmt.finalize();

			// Insert history items
			stmt = db.createStatement(kTagHistoryInsert);
			for (i = 0; i < tagIds.length; i++) {
				for (var j = 0; j < contextIds.length; j++) {
					stmt.bindInt32Parameter(0, contextIds[j]);
					stmt.bindInt32Parameter(1, tagIds[i]);
					stmt.executeStep();
					stmt.reset();
				}
			}
			stmt.finalize();

			// Trim history, recalculate context weights and remove unused contexts
			stmt = db.createStatement(kTrimHistory);
			stmt.bindInt32Parameter(0, kTagHistoryMaxItems);
			stmt.executeStep();
			stmt.finalize();
			db.executeSimpleSQL(kUpdateContextWeights);
			db.executeSimpleSQL(kTrimContexts);

			db.commitTransaction();

		} catch (e) {
			db.rollbackTransaction();
			throw e;
		} finally {
			stmt.finalize();
		}

		// True if all tags were found in the db
		return tagIds.length == tagcount;
	}
};

var TagHistoryModule = {
	registerSelf: function(compMgr, fileSpec, location, type)
	{
		var compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
		compMgr.registerFactoryLocation(DANBOORU_TAGHISTORYSERVICE_CID,
				"Danbooru Tag History Service",
				DANBOORU_TAGHISTORYSERVICE_CONTRACTID,
				fileSpec,
				location,
				type);
	},

	unregisterSelf: function(aCompMgr, aLocation, aType)
	{
		aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
		aCompMgr.unregisterFactoryLocation(CID, aLocation);
	},

	getClassObject: function(compMgr, cid, iid)
	{
		if (!cid.equals(DANBOORU_TAGHISTORYSERVICE_CID))
			throw Components.results.NS_ERROR_NO_INTERFACE;
		if (!iid.equals(Ci.nsIFactory))
			throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
		return TagHistoryFactory;
	}

};

var TagHistoryFactory = {
	createInstance: function(outer, iid)
	{
		if (outer != null)
			throw Components.results.NS_ERROR_NO_AGGREGATION;
		return tagHistoryService;
	}
};

// XPCOM Registration Function -- called by Firefox
function NSGetModule(compMgr, fileSpec)
{
	return TagHistoryModule;
}
