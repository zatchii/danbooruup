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
const kTagGetIds = 'SELECT tag_name, tag_id FROM tag WHERE tag_name IN (%%%)';

const kTagHistoryMaxItems = 10000;
const kTagHistoryName = 'tag_history';
const kTagHistorySchema = 'th_id INTEGER PRIMARY KEY, tag_id INTEGER NOT NULL, ctx_id INTEGER NOT NULL';
const kTagHistoryCreate = 'CREATE TABLE IF NOT EXISTS tag_history(th_id INTEGER PRIMARY KEY, tag_id INTEGER NOT NULL, ctx_id INTEGER NOT NULL)';
const kTagContextName = 'tag_context';
const kTagContextSchema = 'ctx_id INTEGER PRIMARY KEY, context TEXT NOT NULL UNIQUE, weight REAL DEFAULT 1';
const kTagContextCreate = 'CREATE TABLE IF NOT EXISTS tag_context(ctx_id INTEGER PRIMARY KEY, context TEXT NOT NULL UNIQUE, weight REAL DEFAULT 1)';
const kTagHistoryInsert = 'INSERT INTO tag_history(ctx_id, tag_id) VALUES(?1, ?2)';
const kTagContextInsert = 'INSERT OR IGNORE INTO tag_context(context) VALUES(?1)';
const kTagContextGetIds = 'SELECT context, ctx_id FROM tag_context WHERE context IN (%%%)';
const kTrimHistory = 'DELETE FROM tag_history WHERE th_id IN (SELECT th_id FROM tag_history ORDER BY th_id LIMIT (SELECT max(0, count() - ?1) FROM tag_history))';
const kUpdateContextWeights = 'UPDATE tag_context SET weight = 1.0 / (SELECT count() from tag_history WHERE tag_history.ctx_id = tag_context.ctx_id)';
const kTrimContexts = 'DELETE FROM tag_context WHERE weight is NULL';
const kHistorySearch = 'SELECT tag_name, tag_type, ambiguous FROM tag JOIN tag_history USING (tag_id) JOIN tag_context USING (ctx_id) ' +
			"WHERE tag_name LIKE ?1 ESCAPE '\\' AND context IN (%%%) GROUP BY tag_id ORDER BY SUM(weight) DESC, tag_count DESC, tag_name LIMIT ?";

const kSpecHistoryMaxItems = 2000;
const kSpecHistoryCreate = 'CREATE TABLE IF NOT EXISTS spec_history(sh_id INTEGER PRIMARY KEY, spec TEXT NOT NULL, value TEXT NOT NULL, context TEXT NOT NULL)';
const kSpecHistoryInsert = 'INSERT INTO spec_history(spec, value, context) VALUES(?1, ?2, ?3)';
const kTrimSpecHistory = 'DELETE FROM spec_history WHERE sh_id <= (SELECT MAX(sh_id) - ? FROM spec_history)';
const kSpecSearch = "SELECT value FROM spec_history WHERE value LIKE ?1 ESCAPE '\\' AND context IN (%%%) AND spec = ? GROUP BY value ORDER BY COUNT() DESC, value ASC LIMIT ?";

const kTagSearch = "SELECT tag_name, tag_type, ambiguous FROM tag WHERE tag_name LIKE ?1 ESCAPE '\\' ORDER BY tag_count DESC, tag_name ASC LIMIT ?2";
// const kTagSearchAlt = "SELECT tag_name, tag_type FROM tag WHERE tag_name LIKE ?1 ESCAPE '\\' ORDER BY value DESC, LENGTH(tag_name) ASC, tag_name ASC LIMIT ?2";

const kRemoveAll = 'DELETE FROM tag';
const kDeleteContext = 'DELETE FROM tag_context';
const kDeleteHistory = 'DELETE FROM tag_history';
const kDeleteSpecHistory = 'DELETE FROM spec_history';
const kMaxID = 'SELECT max(tag_id) FROM tag';
const kRowCount = 'SELECT count() FROM tag';

const tagPrefix = /^$|^[-~]$|^ambiguous:|^(:?general|artist|char(?:acter)?|copy(?:right)?):/;


const Cc = Components.classes;
const Ci = Components.interfaces;
const prefService	= Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService);
const observerService	= Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
const threadManager	= Cc['@mozilla.org/thread-manager;1'].getService(Ci.nsIThreadManager);

const appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
const versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);

function __log(msg)
{
	Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService).logStringMessage(msg);
	return msg;
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
		var stmt = db.createStatement(statement);
		try {
			stmt.executeStep();
			var res = stmt[method](0);
		} finally {
			stmt.finalize();
		}
		return res;
	},

	setUpTables: function()
	{
		var db = this.db;
		db.executeSimpleSQL(kTagTableCreate + ';' + kTagHistoryCreate + ';' + kTagContextCreate + ';' + kSpecHistoryCreate + ';' + kSetCollate);
		db.schemaVersion = 1;
	},

	get rowCount()
	{
		var res = this.dbGetSimple(kRowCount, 'getInt32');
		return res;
	},

	get maxID()
	{
		var res = this.dbGetSimple(kMaxID, 'getInt32');
		return res;
	},

	// Check if a URI is in Danbooru 2 format
	isDanbooru2: function(uri)
	{
		return /\/uploads\.xml$/.test(uri) || /\/tags.json$/.test(uri);
	},

	// Make GET request and parse response as JSON
	jsonRequest: function(uri, callback, error, progress)
	{
		var request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Ci.nsIXMLHttpRequest);

		var isFile = /^file:\/\//.test(uri);

		request.addEventListener('load', function(ev) {
			var parsed;
			if (this.status == 200 || isFile) {
				try {
					parsed = JSON.parse(this.responseText);
				} catch (e) {
					error("bad_json", null);
					return;
				}
				callback(parsed);
			} else {
				error("http_error", this.status);
			}
		}, false);
		if (error) {
			request.addEventListener('error', function(ev) {
				error("request_error", null);
			}, false);
			request.addEventListener('abort', function(ev) {
				error("cancelled", null);
			}, false);
		}
		if (progress) {
			request.addEventListener('progress', function(ev) {
				progress.progress("downloading", ev.loaded, ev.total);
			}, false);
		}

		request.overrideMimeType('application/json');
		request.open('GET', uri);

		request.send(null);

		// Return function that cancels request
		return function() { request.abort(); };
	},

	searchRelatedTags: function(tag, callback)
	{
		var updateuri = prefService.getBranch('extensions.danbooruUp.').getComplexValue('updateuri', Ci.nsISupportsString).data
		var isdanbooru2 = this.isDanbooru2(updateuri);

		var uri;
		if (isdanbooru2) {
			uri = updateuri.replace(/\/[^/]+$/, '/related_tag.json') + '?query=' + encodeURIComponent(tag);
		} else {
			uri = updateuri.replace(/\/[^/]+\/[^/]+$/, '/tag/related.json') + '?tags=' + encodeURIComponent(tag);
		}

		var o = this;
		this.jsonRequest(
			uri,
			function(response) {
				var tagarray;
				if (isdanbooru2) {
					tagarray = response.tags.concat(response.wiki_page_tags);
				} else {
					tagarray = response[tag];
				}
				var tags = [];
				for (var i = 0; i < tagarray.length; i++) {
					tags.push(tagarray[i][0]);
				}

				callback.handleSearchResult(tag, o.enhanceTags(tags));
			},
			function(error, info) {
				__log("Got " + error + " on related tag search");
			}
		);
	},

	// Add tag types from database to a plain array of tag names.
	enhanceTags: function(tags)
	{
		var richtags = [];
		var stmt = this.db.createStatement(kTagLookup);
		try {
			for (var i = 0; i < tags.length; i++) {
				stmt.bindStringParameter(0, tags[i]);
				if (stmt.executeStep()) {
					richtags.push([tags[i], stmt.getInt32(1), stmt.getInt32(2)]);
				} else {
					richtags.push([tags[i], 0, 0]);
				}
				stmt.reset();
			}
		} finally {
			stmt.finalize();
		}
		return richtags;
	},

	artistSearch: function(imageURI, postURI, callback, error)
	{
		var searchuri;
		if (this.isDanbooru2(postURI)) {
			searchuri = postURI.replace(/\/uploads\.xml$/, "/artists.json?search%5Bname%5D=" + encodeURIComponent(imageURI));
		} else {
			searchuri = postURI.replace(/\/post\/create\.xml$/, "/artist/index.json?name=" + encodeURIComponent(imageURI));
		}

		this.jsonRequest(
			searchuri,
			function(response) {
				var names = [];
				for (var i = 0; i < response.length; i++) {
					names.push(response[i].name);
				}
				callback.handleSearchResult(imageURI, names);
			},
			error.handleError
		);
	},


	autocompleteSearch: function(query, prefix, context, callback)
	{
		var db = this.db;
		var limit = this._acPrefs.getIntPref('limit');
		var alternate = this._acPrefs.getBoolPref('altsearch');

		if (!tagPrefix.test(prefix) && !this._acPrefs.getBoolPref('keephistory')) {
			callback.handleSearchResult(prefix, null);
			return;
		}

		if (prefix !== '' && prefix.charAt(0) == '-') {
			context = context.concat('__NEG__');
			prefix = prefix.slice(1);
		}
		this.searchTags(query, prefix, context, limit, alternate, db, callback.handleSearchResult);
	},

	clearTags: function()
	{
		this.db.executeSimpleSQL(kRemoveAll);
	},

	clearHistory: function()
	{
		this.db.executeSimpleSQL(kDeleteHistory + ';' + kDeleteContext + ';' + kDeleteSpecHistory);
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
	searchTags: function(aquery, prefix, context, limit, alternate, db, callback)
	{
		var res = [];
		var seen = {};

		var query = aquery.toLowerCase();
		if (alternate)
			query = this.alternateQuery(query);
		else if (query.indexOf('*') == -1)
			query += '*';

		if (!tagPrefix.test(prefix)) {
			this.searchSpecs(query, prefix, context, limit, db, callback);
			return;
		}

		//var time1 = (new Date()).getTime();

		// First get recently used tags.
		var stmt = db.createStatement(this.expandQuery(kHistorySearch, context.length));
		query = stmt.escapeStringForLIKE(query, '\\');
		query = query.replace(/\*/g, '%');
		stmt.bindStringParameter(0, query);
		for (var i = 1; i <= context.length; i++)
			stmt.bindStringParameter(i, context[i - 1]);
		stmt.bindInt32Parameter(context.length + 1, limit);

		stmt.executeAsync({
			handleError: function(error) {
				__log("history search failed: " + error.message);
			},
			handleResult: function(result) {
				var row, tag_name, tag_type, ambiguous;
				while (row = result.getNextRow()) {
					tag_name = row.getResultByIndex(0);
					tag_type = row.getResultByIndex(1);
					ambiguous = row.getResultByIndex(2);
					res.push([tag_name, tag_type, ambiguous]);
					seen[tag_name] = true;
				}
			},
			handleCompletion: function(reason) {
				if (reason != Ci.mozIStorageStatementCallback.REASON_FINISHED)
					return;
				// var time2 = (new Date()).getTime();

				// Then fill up with normal results.
				stmt = db.createStatement(kTagSearch);
				stmt.bindStringParameter(0, query);
				stmt.bindInt32Parameter(1, limit);

				stmt.executeAsync({
					handleError: function(error) {
						__log("tag search failed: " + error.message);
					},
					handleResult: function(result) {
						var row, tag_name, tag_type, ambiguous;
						while (res.length < limit && (row = result.getNextRow())) {
							tag_name = row.getResultByIndex(0);
							tag_type = row.getResultByIndex(1);
							ambiguous = row.getResultByIndex(2);
							if (!seen[tag_name])
								res.push([tag_name, tag_type, ambiguous]);
						}
					},
					handleCompletion: function(reason) {
						if (reason != Ci.mozIStorageStatementCallback.REASON_FINISHED)
							return;
						// var time3 = (new Date()).getTime();
						/* dump('\nq1 used ');
						dump(time2 - time1);
						dump('\nq2 used ');
						dump(time3 - time2);
						*/
						callback(aquery, res);
					}
				});
			}
		});
	},

	searchSpecs: function(query, prefix, context, limit, db, callback)
	{
		var res = [];
		var stmt = db.createStatement(this.expandQuery(kSpecSearch, context.length));
		query = stmt.escapeStringForLIKE(query, '\\');
		query = query.replace(/\*/g, '%');
		stmt.bindStringParameter(0, query);
		for (var i = 1; i <= context.length; i++)
			stmt.bindStringParameter(i, context[i - 1]);
		stmt.bindStringParameter(context.length + 1, prefix);
		stmt.bindInt32Parameter(context.length + 2, limit);

		stmt.executeAsync({
			handleError: function(error) {
				__log("metatag history search failed: " + error.message);
			},
			handleResult: function(result) {
				var row, tag_name;
				while (row = result.getNextRow()) {
					tag_name = row.getResultByIndex(0);
					res.push([tag_name, 0, 0]);
				}
			},
			handleCompletion: function(reason) {
				if (reason != Ci.mozIStorageStatementCallback.REASON_FINISHED)
					return;
				callback('', res);
			}
		});

	},

	updateTagListFromURI: function(uri, progress)
	{
		if (this._dbBusy || !this._acPrefs.getBoolPref('enabled'))
			throw Components.results.NS_ERROR_NOT_AVAILABLE;
		this._dbBusy = true;

		var o = this;
		var rowCountAtStart = this.rowCount;

		var cancel;
		if (this.isDanbooru2(uri)) {
			cancel = this.updateDanbooru2Tags(uri, onComplete, onError, progress);
		} else {
			cancel = this.updateDanbooru1Tags(uri, onComplete, onError, progress);
		}

		return function() {
			o._dbBusy = false;
			cancel();
		};

		function onComplete() {
			o._dbBusy = false;
			var insertedRows = o.rowCount - rowCountAtStart;
			observerService.notifyObservers(new supsInt32(insertedRows), 'danbooru-update-done', null);
		}
		function onError(error, info) {
			o._dbBusy = false;
			__log('Tag update failed, ' + error);
			var msg = error;
			if (error == 'http_error')
				msg += '  ' + info;
			observerService.notifyObservers(null, 'danbooru-update-failed', msg);
		}
	},

	updateDanbooru1Tags: function(uri, complete, error, progress)
	{
		uri += "?limit=0";
		var maxId = this.maxID;
		if (maxId) {
			uri += "&after_id=" + maxId;
		}

		if (progress) progress.progress("connecting", 0, 0);
		return this.fetchAndInsertTags(
			uri,
			false,
			complete,
			error,
			progress
		);
	},

	updateDanbooru2Tags: function(uri, complete, error, progress)
	{
		var o = this;
		var cancelled = false;
		var cancelCb = null;

		if (progress) progress.progress("maxid_check", 0, 0);
		this.getMaxTagIdOnBooru(uri,
			checkDistance,
			error
		);

		return function() {
			cancelled = true;
			if (cancelCb) cancelCb();
		};

		function checkDistance(targetId) {
			if (cancelled) {
				error("cancelled", null);
				return;
			}
			var needFullUpdate = (targetId - o.maxID) > 1000;
			if (needFullUpdate) {
				var fullUri = uri.replace(/\/tags\.json$/, "/cache/tags.json");
				if (progress) progress.progress("connecting", 0, 0);
				var planb = error;
				if (fullUri == 'http://danbooru.donmai.us/cache/tags.json') {
					planb = function(reason, msg) {
						// Plan B
						// TODO: remove this when cache/tags is reliable
						__log("Tag fetch error," + reason + " " + msg);
						__log("Falling back to offsite tag dump");
						cancelCb = o.fetchAndInsertTags('http://pianosite.net/danbooruup/tags.php', true, complete, error, progress);
					};
				}
				cancelCb = o.fetchAndInsertTags(fullUri, true, complete, planb, progress);
				// TODO: should top up with fetchTagsRepeated
			} else {
				cancelCb = o.fetchTagsRepeated(uri, targetId, 2, complete, error, progress);
			}
		}
	},

	// Get largest tag ID present on a booru
	getMaxTagIdOnBooru: function(uri, complete, error)
	{
		var latestUri = uri + '?search%5Border%5D=date';
		return this.jsonRequest(latestUri,
			function(tags) {
				complete(tags[0].id);
			},
			error
		);
	},

	// Do several update attempts up to a set limit to get up to date
	fetchTagsRepeated: function(uri, targetId, maxAttempts, complete, error, progress)
	{
		var o = this;
		var startId = o.maxID;
		var cancelled = false;
		var cancelCb = null;

		doFetch();

		return function() {
			cancelled = true;
			if (cancelCb) cancelCb();
		};

		function doFetch() {
			if (cancelled) {
				error("cancelled", null);
				return;
			}
			if (maxAttempts <= 0) {
				complete();
				return;
			}
			maxAttempts--;

			var currentMaxId = o.maxID;
			if (currentMaxId >= targetId) {
				complete();
				return;
			}

			var updateUri = uri + '?page=a' + currentMaxId;

			if (progress) progress.progress("connecting", currentMaxId - startId, targetId - startId);

			cancelCb = o.fetchAndInsertTags(updateUri, true,
				function(ntags) {
					if (ntags == 0) {
						complete();
						return;
					}
					// On success, do another round
					doFetch();
				},
				error,
				progress
			);
		}
	},

	fetchAndInsertTags: function(uri, isDanbooru2, complete, error, progress)
	{
		var o = this;
		var db = this.db;

		return this.jsonRequest(uri,
			function(tags) {
				try {
					o.insertTags(tags, isDanbooru2, db, progress);
				} catch (e) {
					error("inserterror", e);
					throw e;
				}
				complete(tags.length);
			},
			error,
			progress
		);
	},

	insertTags: function(tags, isDanbooru2, db, progress)
	{
		var stmt = db.createStatement(kTagInsert);
		var tagCount = 0;
		try {
			var thread = threadManager.currentThread;
			db.beginTransaction();
			// var time = (new Date()).getTime();
			for (var i = 0; i < tags.length; i++) {
				var tag = tags[i];
				if (isDanbooru2) {
					if (tag.post_count == 0) continue;
					stmt.bindInt32Parameter(0, tag.id);
					stmt.bindStringParameter(1, tag.name);
					stmt.bindInt32Parameter(2, tag.post_count);
					stmt.bindInt32Parameter(3, tag.category);
					stmt.bindInt32Parameter(4, false);
				} else {
					stmt.bindInt32Parameter(0, tag.id);
					stmt.bindStringParameter(1, tag.name);
					stmt.bindInt32Parameter(2, tag.count);
					stmt.bindInt32Parameter(3, tag.type);
					stmt.bindInt32Parameter(4, tag.ambiguous);
				}
				stmt.executeStep();
				stmt.reset();
				if ((++tagCount & 255) === 0) {
					while (thread.hasPendingEvents()) {
						thread.processNextEvent(false);
					}
					if (progress)
						progress.progress("inserting", i, tags.length);
				}
			}
			db.commitTransaction();
			if (progress)
				progress.progress("inserting", tags.length, tags.length);
		} catch (e) {
			db.rollbackTransaction();
			throw e;
		} finally {
			stmt.finalize();
			// __log('Insert time ');
			// __log((new Date()).getTime() - time);
		}
	},

	updateTagHistory: function(tags, context)
	{
		if (!this._acPrefs.getBoolPref('keephistory'))
			return;

		var context_m = context.concat('__NEG__');
		// Eliminate duplicates.
		var tagdict = {};
		var tagcount = 0;
		var ctxdict = {};
		var ctxcount = 0;
		var speclist = [];
		var i;

		for (i = 0; i < tags.length; i++) {
			let t = tags[i][0];
			let p = tags[i][1];
			let is_tag = tagPrefix.test(p);
			let is_neg = p !== '' && p.charAt(0) == '-';
			if (is_neg)
				p = p.slice(0);
			if (is_tag) {
				if (!(t in tagdict)) {
					if (is_neg)
						ctxdict['__NEG__'] = '__NEG__';
					tagdict[t] = is_neg ? context_m : context;
					tagcount++;
				}
			} else {
				speclist.push([p, t, is_neg ? context_m : context]);
			}
		}
		for (i = 0; i < context.length; i++) {
			if (!(context[i] in ctxdict)) {
				ctxdict[context[i]] = context[i];
				ctxcount++;
			}
		}

		if (ctxcount == 0 || (tagcount == 0 && speclist.length == 0))
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
			contextIds = {};
			stmt = db.createStatement(this.expandQuery(kTagContextGetIds, ctxcount));
			i = 0;
			for (ctx in ctxdict)
				stmt.bindStringParameter(i++, ctx);
			while (stmt.executeStep())
				contextIds[stmt.getString(0)] = stmt.getInt32(1);
			stmt.finalize();

			// Get ids for tags
			tagIds = {};
			stmt = db.createStatement(this.expandQuery(kTagGetIds, tagcount));
			i = 0;
			for (tag in tagdict)
				stmt.bindStringParameter(i++, tag);
			while (stmt.executeStep())
				tagIds[stmt.getString(0)] = stmt.getInt32(1);
			stmt.finalize();

			var found_tags = 0;
			// Insert history items
			stmt = db.createStatement(kTagHistoryInsert);
			for (var tag in tagIds) {
				found_tags++;
				let tag_id = tagIds[tag];
				let ctx = tagdict[tag];
				for (var j = 0; j < ctx.length; j++) {
					let ctx_id = contextIds[ctx[j]];
					if (!ctx_id)
						continue;
					stmt.bindInt32Parameter(0, ctx_id);
					stmt.bindInt32Parameter(1, tag_id);
					stmt.executeStep();
					stmt.reset();
				}
			}
			stmt.finalize();

			// Insert search specifiers
			stmt = db.createStatement(kSpecHistoryInsert);
			for (i = 0; i < speclist.length; i++) {
				let spec = speclist[i][0];
				let value = speclist[i][1];
				let ctx = speclist[i][2];
				for (var j = 0; j < ctx.length; j++) {
					stmt.bindStringParameter(0, spec);
					stmt.bindStringParameter(1, value);
					stmt.bindStringParameter(2, ctx[j]);
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

			stmt = db.createStatement(kTrimSpecHistory);
			stmt.bindInt32Parameter(0, kSpecHistoryMaxItems);
			stmt.executeStep();
			stmt.finalize();

			db.commitTransaction();

		} catch (e) {
			db.rollbackTransaction();
			throw e;
		} finally {
			stmt.finalize();
		}

		// True if all tags were found in the db
		return found_tags == tagcount;
	}
};

// No longer used in Firefox 4
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

// XPCOM Registration Function -- called by Firefox 3
function NSGetModule(compMgr, fileSpec)
{
	return TagHistoryModule;
}

// called by Firefox 4
function NSGetFactory(cid)
{
	if (!cid.equals(DANBOORU_TAGHISTORYSERVICE_CID))
		throw Components.results.NS_ERROR_FACTORY_NOT_REGISTERED;
	return TagHistoryFactory;
}
