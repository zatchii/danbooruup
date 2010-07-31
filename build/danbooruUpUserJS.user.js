// ==UserScript==
	// @name DanbooruUp user script
	// @description Tag field autocompleter for Danbooru.
	// @version 0.3.6
	// @match http://danbooru.donmai.us/*
	// @match http://safebooru.donmai.us/*
// ==/UserScript==

(function() {

// Drop privileges in Chrome
if (typeof window.GM_xmlhttpRequest == "function") {
	location.href = "javascript:(" + encodeURI(arguments.callee) + ")();";
	return;
}

var style_arr = {
	'0': '',
	'1': 'color: #a00;',
	'2': 'background: #ddd;',
	'3': 'color: #a0a;',
	'4': 'color: #0a0;',
	'0.selected': '',
	'1.selected': '',
	'2.selected': '',
	'3.selected': '',
	'4.selected': '',
};

if (!window.KeyEvent) {
	window.KeyEvent = {
		DOM_VK_RETURN: 13,
		DOM_VK_CONTROL: 17,
		DOM_VK_ESCAPE: 27,
		DOM_VK_SPACE: 32,
		DOM_VK_PAGE_UP: 33,
		DOM_VK_PAGE_DOWN: 34,
		DOM_VK_UP: 38,
		DOM_VK_DOWN: 40,
		DOM_VK_INSERT: 45,
		DOM_VK_E: 69,
		DOM_VK_HELP: 6
	};
}

var danbooruUpDBUpdater = {
	defaults: {
		'Enable': true,
		'EnableUpdates': false,
		'UpdateFrequency': 24,
		'UpdateOnSubmit': false,
		'AlternateSearching': false,
		'LastUpdated': 0,
		'ForceUpdate': false,
		'KeepHistory': true,
		'Aborts': 0,
	},

	options: [
		{s: 'Enable', l: 'Enable tag autocompletion',
			c: [
				{s: 'AlternateSearching', l: 'Alternate searching (abc -> *a*b*c*)'},
				{s: 'KeepHistory', l:'Use search history'},
				{s: 'UpdateOnSubmit', l: 'Update after post submission'},
				{s: 'EnableUpdates', l: 'Periodic updates',
					c: [
					 {s: 'UpdateFrequency', l: 'Hours between updates'}
				]},
		]},
	],

	database: null,
	status_div: null,

	init: function(is_retry)
	{
		if (!is_retry) {
			this.initSettings();
			this.initGui();
		}
		if (this.initDatabase())
			return; // Wait for database to be initialised

		if (!this.status_div)
			return;

		this.checkForUpdate(false);
		this.doHistory();
	},

	initSettings: function()
	{
		if (!window.localStorage)
			return;
		for (d in this.defaults) {
			if (localStorage['danbooruUp' + d] === undefined)
				localStorage['danbooruUp' + d] = this.defaults[d]
		}
	},

	initGui: function()
	{
		var navbar = document.getElementById('navbar') || document.getElementById('links');
		if (!navbar)
			return;

		var cssdec = '#dbu_panel { background: white; border: 1px solid black; position: absolute; padding: 0.2em; border-radius: 0.5em;' + 
			' -o-transition: opacity 0.2s; -webkit-transition: opacity 0.2s; } ' +
			'#dbu_panel h3 { font-family: "verdana", sans-serif; font-size: 15px; font-weight: 400; margin-left: 1em;} ' +
			'#dbu_panel ul { list-style: none; margin: 0} #dbu_panel li { margin: 0; margin-top: 0.2em; } ' +
			'#dbu_panel label { font-weight: normal; margin-left: 0.2em; }' +
			'#dbu_panel input[type=number] { width: 3em; }' +
			'#dbu_status { height: 1.5em; }' +
			'#dbu_button { -o-transition: color 0.5s; -webkit-transition: color 0.5s; }';

		var style = document.createElement("style");
		style.appendChild(document.createTextNode(cssdec));
		document.getElementsByTagName("head")[0].appendChild(style);


		// Make configure link
		var menuItem = document.createElement('a');
		menuItem.appendChild(document.createTextNode('\u25ca'));
		menuItem.href = '';
		menuItem.id = 'dbu_button';
		menuItem.title = 'Autocompletion settings';
		menuItem.addEventListener('click', function(e) {
			panel.style.display = (panel.style.display == 'none' ? '' : 'none');
			// Only fades in, not out since display:none is instant.
			panel.style.opacity = (panel.style.opacity == 1 ? 0 : 1);
			e.preventDefault();
		}, false);
		if (navbar.id == 'navbar')
			navbar.insertBefore(document.createElement('li'), navbar.lastElementChild).appendChild(menuItem);
		else
			navbar.insertBefore(menuItem, navbar.lastElementChild);
		this.menuItem = menuItem;

		// Make panel
		var o = this;
		var panel = document.querySelector('body').appendChild(document.createElement('div'));
		panel.id = 'dbu_panel';
		panel.innerHTML = '<h3>Autocompletion settings</h3> <div></div>' +
			'<input type="button" value="Update now"/> <input type="button" value="Clear tags"/> <input type="button" value="Clear history"/> <div><small id="dbu_status"/></div>';

		var buttons = panel.querySelectorAll('input');
		buttons[0].onclick = function() { o.checkForUpdate(true) };
		buttons[1].onclick = function() { o.clearTags() };
		buttons[2].onclick = function() { o.clearHistory() };

		panel.querySelector('div').appendChild(this.makeSettingsForm(this.options));
		this.updateDisplay();

		this.status_div = panel.querySelector('small');

		// Position and hide.
		panel.style.top = menuItem.offsetTop + menuItem.offsetHeight + 'px';
		panel.style.left = Math.max(0, menuItem.offsetLeft + menuItem.offsetWidth - panel.offsetWidth) + 'px';
		panel.style.display = 'none';
		panel.style.opacity = 0;
	},

	makeSettingsForm: function(options)
	{
		function setType(input, type) {
			if (type == 'number') {
				input.type = 'number';
				input.min = 0;
				input.step = 'any';
			} else {
				input.type = 'checkbox';
			}
		}
		var form = document.createDocumentFragment();
		var ul = form.appendChild(document.createElement('ul'));

		var o = this;
		function change(e) { o.changeSetting(this); }

		for (var i = 0; i < options.length; i++) {
			var li = ul.appendChild(document.createElement('li'));

			var opt = options[i];
			var input = li.appendChild(document.createElement('input'));
			input.id = 'dbu_' + opt.s;
			setType(input, typeof(this.defaults[opt.s]));
			input.onchange = change;

			var label = li.appendChild(document.createElement('label'));
			label.appendChild(document.createTextNode(opt.l));
			label.htmlFor = input.id;

			if (opt.c)
				form.appendChild(this.makeSettingsForm(opt.c));
		}
		return form;
	},

	changeSetting: function(input) {
		if (input.checkValidity && !input.checkValidity())
			return;
		var sname = input.id.substring(4);
		function find(opts) {
			if (!opts || !opts.length)
				return null;
			if (opts[0].s == sname)
				return opts[0];
			return find(opts[0].c) || find(opts.slice(1));
		}
		var sopts = find(this.options);
		var value = input.type == 'checkbox' ? input.checked : input.value;

		this.setConfig(sname, value);
		this.updateDisplay();
	},

	// Enable/disable configuration options according to current settings.
	updateDisplay: function() {
		if (!window.localStorage || !this.menuItem)
			return;
		var o = this;
		function update(opts, disabled) {
			for (var i = 0; i < opts.length; i++) {
				var e = document.getElementById('dbu_' + opts[i].s);
				if (e.type == 'checkbox')
					e.checked = o.getConfig(opts[i].s);
				else
					e.value = o.getConfig(opts[i].s);
				e.disabled = disabled;
				if (opts[i].c)
					update(opts[i].c, disabled || !e.checked);
			}
		}
		update(this.options, false);
	},

	initDatabase: function()
	{
		if (!window.openDatabase) {
			this.error("Your browser does not support Web SQL database. Upgrade to Opera 10.50 or later.");
			return;
		}

		try {
			this.database = openDatabase('danbooruUp', '', 'Tag database', 15 * 1024 * 1024);
			if (this.database.version != '1.0') {
				this.createTables(this.database);
				return true;
			}
		} catch (e) {
			this.error('Could not open database, ' + e.message + '.');
		}
	},

	createTables: function(db)
	{
		var o = this;
		db.changeVersion('', '1.0', function(t) {
			t.executeSql('CREATE TABLE IF NOT EXISTS config(name TEXT PRIMARY KEY, value)');
			t.executeSql('CREATE TABLE IF NOT EXISTS tag(tag_id INTEGER PRIMARY KEY, tag_name TEXT NOT NULL UNIQUE, tag_count INTEGER NOT NULL DEFAULT 0, tag_type INTEGER NOT NULL DEFAULT 0, ambiguous INTEGER NOT NULL DEFAULT 0)');
			t.executeSql('CREATE TABLE IF NOT EXISTS tag_history(th_id INTEGER PRIMARY KEY, tag_id INTEGER NOT NULL, ctx_id INTEGER NOT NULL)');
			t.executeSql('CREATE TABLE IF NOT EXISTS tag_context(ctx_id INTEGER PRIMARY KEY, context TEXT NOT NULL UNIQUE, weight REAL DEFAULT 1)');
			t.executeSql('CREATE TABLE IF NOT EXISTS spec_history(sh_id INTEGER PRIMARY KEY, spec TEXT NOT NULL, value TEXT NOT NULL, context TEXT NOT NULL)');

			t.executeSql("INSERT OR IGNORE INTO config VALUES('last_update_attempt', 0)");
		}, function(e) {
			o.error('Failed to initialise database, ' + e.message + '.');
		},
		function() {
			o.status('Database created, rerunning init.');
			o.init(true);
		});
	},

	clearTags: function()
	{
		if (!confirm('Delete all tags?')) {
			this.status('Canceled reset.');
			return;
		}
		var o = this;
		this.database.transaction(function(t) {
			t.executeSql('DELETE FROM tag');
		}, null, function() { o.status("Tags deleted.") });
	},

	clearHistory: function()
	{
		if (!confirm("Clear search history?")) {
			this.status("Canceled history clearing.");
			return;
		}
		this.database.transaction(function(t) {
			t.executeSql('DELETE FROM tag_history');
			t.executeSql('DELETE FROM tag_context');
			t.executeSql('DELETE FROM spec_history');
		}, null, function() { o.status('History cleared'); });
	},


	checkForUpdate: function(interactive)
	{
		var force = this.getConfig('ForceUpdate');
		if (force)
			this.setConfig('ForceUpdate', false)

		if (!force && !interactive) {
			if (!(this.getConfig('Enable') && this.getConfig('EnableUpdates')))
				return;
			if (!(this.getConfig('LastUpdated') + this.getConfig('UpdateFrequency') * 60 * 60 * 1000 < new Date().getTime()))
				return;
		}
		var o = this;
		this.getConfigDB('last_update_attempt', function(last_attempt) {
			var since_last = new Date().getTime() - last_attempt;

			// An update can take some time, so we take care not to initiate a load of them at once.
			// Uses a time value in the database as a time expiring lock.

			if (since_last < 5 * 60 * 1000 && !(force || interactive &&
					confirm("An update was attempted " + Math.round(since_last / 1000) + " seconds ago and may still be ongoing.\n" +
						"Proceed with update anyway?"))) {
				o.status("Recent update attempt, waiting.");
				return;
			}

			o.database.transaction(function(t) {
				t.executeSql("UPDATE config SET value = ? WHERE name = 'last_update_attempt' AND value = ?",
					[new Date().getTime(), last_attempt],
					function(t, r) {
						// Initiate the update if we got the lock, else fail.
						if (r.rowsAffected == 1) {
							o.fetchTags();
						} else {
							o.status('Could not grab lock, aborting update.');
						}
					});
			});
		});
	},

	fetchTags: function()
	{
		this.status('Checking for tags...');
		this.busy(true);

		var o = this;

		this.database.readTransaction(function (t) {
			t.executeSql('SELECT MAX(tag_id) AS max_id FROM tag', null, function(t, r) {
				var max_id = r.rows.item(0).max_id;
				var path = '/tag/index.json?limit=0';
				if (max_id)
					path += '&after_id=' + (max_id + 1);
				var uri = document.location.protocol + '//' + document.location.host + path;

				var request = new XMLHttpRequest();
				request.open('GET', uri);

				request.onreadystatechange = function(event) {
					if (this.readyState == 3) {
						o.status('Downloading...');
					} else if (this.readyState == 4) {
						if (this.status == 200) {
							o.status('Parsing...');
							// var time1 = new Date().getTime();
							var tags = JSON.parse(this.responseText);
							// console.log('got ' + tags.length + ' tags, parsed in ' +(new Date().getTime() - time1));
							o.insertTags(tags);
						} else {
							o.error('Could not get tags. Status ' + this.status + '.');
						}
					}
				};
				o.setConfig('Aborts', o.getConfig('Aborts') + 1);

				request.send();
			});
		});
	},

	insertTags: function(tags)
	{
		// Could possibly get a small speedup by dropping the tag_name index before inserting many tags,
		// and a larger one by not using placeholders in the query.

		if (!tags.length) {
			this.status('No new tags.');
			this.busy(false);
			return;
		}

		var o = this;

		this.status('Inserting tags...');
		// var time = new Date().getTime();
		this.database.transaction(function(t) {
				o.batchify(t, 'INSERT OR IGNORE INTO tag(tag_id, tag_name, tag_count, tag_type, ambiguous)', 5,
					tags.map(function(tag) {return [tag.id, tag.name, tag.count, tag.type, tag.ambiguous?1:0];}));
		},
		function(e) {
			if (e.code == 4) { // QUOTA_ERR
				alert('An update of the DanbooruUp tag database failed due to insufficient storage quota.\n' + 
					'Please increase the local storage quota before enabling updates.');
				o.setConfig('EnableUpdates', false);
				o.setConfig('UpdateOnSubmit', false);
				o.updateDisplay();
			}
			o.error('Database insertion failed due to error, ' + e.message + ' (' + e.code + ').');
			o.setConfig('Aborts', o.getConfig('Aborts') - 1000);
			o.busy(false);
		},
		function() {
			// console.log('Inserted in ' + (new Date().getTime() - time));
			o.setConfig('LastUpdated', new Date().getTime());
			o.setConfig('Aborts', o.getConfig('Aborts') - 1);
			o.status('Downloaded ' + tags.length + ' tags.');
			o.busy(false);
		});
	},

	// Run the statement in the transaction using UNION ALL to insert multiple items per statement.
	batchify: function(transaction, statement, ncolumns, data)
	{
		if (data.length == 0)
			return;
		var max_args = 200;
		var base_args = statement.split('?').length - 1;
		var step = Math.floor((max_args - base_args) / ncolumns);
		var column = new Array(ncolumns + 1).join('?, ').slice(0,-2);
		var tmp_statement = '';
		var tmp_len = 0;
		var a = [];
		for (var i = 0; i < data.length; i += step) {
			var chunk = data.slice(i, i + step);
			if (chunk.length != tmp_len) {
				tmp_statement = statement + ' SELECT ' + column + new Array(chunk.length).join('UNION ALL SELECT ' + column);
				tmp_len = chunk.length;
			}
			transaction.executeSql(tmp_statement, a.concat.apply(a, chunk));
		}
	},

	// Update the tag history.
	// used_context is a list of context items, tag_context is a {tag: context} mapping and specifier is a {specifier: [value, context]} mapping.
	updateTagHistory: function(used_context, tag_contexts, specifier_contexts)
	{
		function inClause(data) {
			return 'IN (' + new Array(data.length + 1).join('?, ').slice(0,-2) + ')';
		}

		var o = this;

		var tags = [];
		for (tag in tag_contexts)
			tags.push(tag);

		var tag_ids = {}, context_ids = {};

		// var tim = new Date().getTime();
		function insertHistory(t) {
			// Insert all combinations of tags and contexts into the tag history.
			var tag_x_context = [];
			for (var tag in tag_ids) {
				var tag_id = tag_ids[tag];
				tag_contexts[tag].forEach(function(ctx) { tag_x_context.push([tag_id, context_ids[ctx]]); });
			}
			o.batchify(t, 'INSERT INTO tag_history(tag_id, ctx_id)', 2, tag_x_context);

			var spec_x_context = [];
			for (var spec in specifier_contexts) {
				var value = specifier_contexts[spec][0];
				specifier_contexts[spec][1].forEach(function(ctx) { spec_x_context.push([spec, value, ctx]); });
			}
			o.batchify(t, 'INSERT INTO spec_history(spec, value, context)', 3, spec_x_context);

			// Trim history, recalculate context weights, and remove unused contexts
			t.executeSql('DELETE FROM tag_history WHERE th_id <= (SELECT max(th_id) - 10000 FROM tag_history)'); // Max history items is 10,000
			t.executeSql('DELETE FROM spec_history WHERE sh_id <= (SELECT max(sh_id) - 2000 FROM spec_history)'); // Max spec history items is 2,000
			t.executeSql('UPDATE tag_context SET weight = 1.0 / (SELECT count() from tag_history WHERE tag_history.ctx_id = tag_context.ctx_id)');
			t.executeSql('DELETE FROM tag_context WHERE weight is NULL');
		}

		this.database.transaction(function(t) {
			// Read tag ids and context ids, and insert any missing contexts.
			t.executeSql('SELECT tag_id, tag_name FROM tag WHERE tag_name ' + inClause(tags), tags, function(t, r) {
				for (var i = 0; i < r.rows.length; i++) {
					var row = r.rows.item(i);
					tag_ids[row.tag_name] = row.tag_id;
				}
			});
			t.executeSql('SELECT ctx_id, context FROM tag_context WHERE context ' + inClause(used_context), used_context, function(t, r) {
				for (var i = 0; i < r.rows.length; i++) {
					var row = r.rows.item(i);
					context_ids[row.context] = row.ctx_id;
				}

				var new_ctx_items = used_context.filter(function(ctx) { return !(ctx in context_ids); });

				if (new_ctx_items.length == 0) {
					insertHistory(t);
				} else {
					for (i = 0; i < new_ctx_items.length; i++) {
						// Need own closure to store ctx for callback.
						(function(ctx, is_last) {
							t.executeSql('INSERT OR REPLACE INTO tag_context(context) VALUES(?)', [ctx], function(t, r) {
								context_ids[ctx] = r.insertId;
								if (is_last)
									insertHistory(t);
							});
						})(new_ctx_items[i], i == new_ctx_items.length - 1);
					}
				}
			});
		},
		function(e) {
			o.error('Could not save context, ' + e.message + '.');
		},
		function() {
			// console.log('ut ' + (new Date().getTime() - tim));
		});
	},

	// Called right before submission to update the tag history.
	onSubmit: function(search_type, used_context, tag_contexts, specifier_contexts)
	{

		if ((search_type == 'post' || search_type == 'update') && this.getConfig('UpdateOnSubmit'))
			this.setConfig('ForceUpdate', true);

		if (this.getConfig('KeepHistory')) {
			// Put the item in session storage to be inserted on next page load by doHistory.
			var history, history_str = sessionStorage.danbooruUpHistory;
			if (history_str) {
				history = JSON.parse(history_str);
				// Stupid bug in Opera 10.60
				if (typeof history == 'string')
					history = JSON.parse(history);
			} else {
				history = [];
			}
			history.push([used_context, tag_contexts, specifier_contexts]);
			sessionStorage.danbooruUpHistory = JSON.stringify(history);
		}
	},

	// Insert any history that has been queued from onSubmit.
	doHistory: function()
	{
		if (!sessionStorage.danbooruUpHistory)
			return;

		var history = JSON.parse(sessionStorage.danbooruUpHistory);
		// Stupid bug in Opera 10.60
		if (typeof history == 'string')
			history = JSON.parse(history);
		for (var i = 0; i < history.length; i++) {
			var h = history[i];
			this.updateTagHistory(h[0], h[1], h[2]);
		}
		delete sessionStorage.danbooruUpHistory;
	},

	// Get a config value from the database
	getConfigDB: function(name, callback)
	{
		this.database.readTransaction(function(t) {
			t.executeSql('SELECT value FROM config WHERE name = ?', [name], function (t, r) {
				if (r.rows.length == 0)
					callback(null);
				else
					callback(r.rows.item(0).value);
			});
		});
	},

	// Get a config value from localStorage
	getConfig: function(name)
	{
		var parsers = {
			'number': parseFloat,
			'boolean': function(x) {return x == 'true';},
		}
		return parsers[typeof(this.defaults[name])](localStorage['danbooruUp' + name])
	},

	setConfig: function(name, value)
	{
		localStorage['danbooruUp' + name] = value;
	},

	status: function(message)
	{
		if (!this.status_div)
			return
		var sd = this.status_div;
		sd.style.color = 'black';
		while (sd.firstChild)
			sd.removeChild(sd.firstChild);
		sd.appendChild(document.createTextNode(message));
	},

	error: function(message)
	{
		if (window.console && console.error)
			console.error(message);
		if (!this.status_div)
			return
		this.status(message);
		this.status_div.style.color = 'red';
	},

	busy: function(is_busy)
	{
		if (is_busy)
			this.menuItem.style.color='red';
		else
			this.menuItem.style.color='';
	},
}

var danbooruUpCompleter = {
	database: null,   // Set from onload function
	update_context: null,   // Set from onload function
	cur_tag: '',
	cur_prefix: '',
	cur_search_type: '',
	cur_callback: null,
	timer: null,

	tag_prefix_re: /^$|^[-~]$|^ambiguous:|^(:?general|artist|char(?:acter)?|copy(?:right)?):/,

	getSuggestions: function(tag, prefix, search_type, callback)
	{
		this.cur_callback = callback;
		this.cur_tag = tag;
		this.cur_prefix = prefix;
		this.cur_search_type = search_type;
		var o = this;
		if (!this.timer)
			this.timer = window.setTimeout(function() { o.doSearch(); }, 100);
	},

	abortSuggestion: function()
	{
		if (this.timer)
			window.clearTimeout(this.timer);
		this.timer = null;
	},

	// Escape glob wildcards except '*', handle alternate search and add end wildcard
	writeGlob: function(query)
	{
		// Only add wildcards if not present
		if (query.indexOf('*') == -1) {
			if (localStorage.danbooruUpAlternateSearching == 'true')
				query = '*' + query.split(/(?:)/).join('*') + (query ? '*' : ''); // bob -> *b*o*b*
			else
				query = query + '*';
		}
		return query.replace(/[[?]/g, '[$&]'); // Escape '[' and '?' by putting them in single-character sets.
	},

	getContext: function(search_type)
	{
		if (search_type == 'post') {
			var source = document.getElementById('post_source').value;
			var match = source.match(/(?:.*:\/\/)?(.*?)\/(.*)/);
			// Domain name except top level, and path name except file name.
			if (match)
				return ['__ALL__'].concat(match[1].split('.').slice(0,-1), match[2].split('/').slice(0,-1));
			else
				return ['__ALL__', '__POST__'];
		} else if (search_type == 'update') {
			var context = ['__ALL__', '__UPDATE__'];
			// Grab first artist and copyright, if available.
			var tags = document.getElementById('tag-sidebar');
			var artist = tags.querySelector('.tag-type-artist > a:last-of-type');
			var copy = tags.querySelector('.tag-type-copyright > a:last-of-type');
			if (artist)
				context.push(artist.textContent.replace(' ', '_'));
			if (copy)
				context.push(copy.textContent.replace(' ', '_'));
			return context;
		} else {
			return ['__ALL__', '__SEARCH__'];
		}
	},

	doSearch: function()
	{
		this.timer = null;

		var limit = 100;
		var query = this.cur_tag;
		// var t = new Date().getTime();

		var o = this;
		function callback(result) {
			// console.log('st ' + (new Date().getTime() - t));
			o.cur_callback(query, result);
		}

		var tag = this.cur_tag.toLowerCase();
		var prefix = this.cur_prefix.toLowerCase();

		var is_tag = this.tag_prefix_re.test(prefix);

		if (localStorage.danbooruUpKeepHistory == 'true') {
			var context = this.getContext(this.cur_search_type);
			var glob = this.writeGlob(query);
			if (prefix !== '' && prefix.charAt(0) == '-') {
				context.push('__NEG__');
				prefix = prefix.slice(1);
			}
			if (is_tag)
				this.historySearch(glob, context, limit, callback);
			else
				this.specSearch(glob, prefix, context, limit, callback);
		} else {
			if (is_tag)
				this.tagSearch(this.writeGlob(query), limit, callback);
			else
				this.cur_callback(prefix, null);
		}
	},

	// Search for tags ordered by tag history
	historySearch: function(query, context, limit, callback)
	{
		this.database.readTransaction(function(t) {
			t.executeSql('SELECT tag_name, tag_type, ambiguous, tag_count, SUM(weight) FROM tag NATURAL JOIN tag_history NATURAL JOIN tag_context ' +
				'WHERE tag_name GLOB ? AND context IN (' + new Array(context.length + 1).join('?, ').slice(0,-2) + ') GROUP BY tag_id ' +
				'UNION ALL SELECT tag_name, tag_type, ambiguous, tag_count, 0 FROM tag WHERE tag_name GLOB ? ' +
				'ORDER BY SUM(weight) DESC, tag_count DESC, tag_name LIMIT ?',
				[query].concat(context, query, limit * 2), // There may be duplicates in the join, so select 2*limit to get at least limit.
				function(t, r) {
					var seen = {};
					var tags = [];
					var rows = r.rows;
					for (var i = 0; i < rows.length && tags.length < limit; i++) {
						var tag = rows.item(i);
						if (!(tag.tag_name in seen)) {
							tags.push([tag.tag_name, tag.tag_type, tag.ambiguous]);
							seen[tag.tag_name] = true;
						}
					}
					callback(tags);
				}
			);
		});
	},

	// Search for tags ordered by tag count
	tagSearch: function(query, limit, callback)
	{
		this.database.readTransaction(function(t) {
			t.executeSql('SELECT tag_name, tag_type, ambiguous FROM tag WHERE tag_name GLOB ? ORDER BY tag_count DESC, tag_name ASC LIMIT ?',
				[query, limit],
				function(t, r) {
					// callback(Array.map(rows, function(tag) [tag.tag_name, tag.tag_count, tag.ambiguous]));
					var tags = [];
					var rows = r.rows;
					for (var i = 0; i < rows.length; i++) {
						var tag = rows.item(i);
						tags.push([tag.tag_name, tag.tag_type, tag.ambiguous]);
					}
					callback(tags);
				}
			);
		});
	},

	// Search search specifier history
	specSearch: function(query, specifier, context, limit, callback) {
		this.database.readTransaction(function(t) {
			t.executeSql('SELECT value FROM spec_history WHERE ' +
				'spec=? AND value glob ? AND context IN (' + new Array(context.length + 1).join('?, ').slice(0, -2) + ') ' +
				'GROUP BY value ORDER BY count() DESC, value ASC LIMIT ?',
				[specifier, query].concat(context, limit),
				function(t, r) {
					var values = [];
					var rows = r.rows;
					for (var i = 0; i < rows.length; i++) {
						values.push([r.rows.item(i).value, 0, 0]);
					}
					callback(values);
				}
			);
		});
	},

	// Add tag type info to a list of tag names.
	enhanceTags: function(tags, callback)
	{
		if (tags.length == 0)
			return [];

		rich_tags = {};
		this.database.readTransaction(function(t) {
			t.executeSql('SELECT tag_name, tag_type, ambiguous FROM tag WHERE tag_name IN (' +
					new Array(tags.length + 1).join('?, ').slice(0,-2) + ')', tags,
				function(t, r) {
					for (var i = 0; i < r.rows.length; i++) {
						var tag = r.rows.item(i);
						rich_tags[tag.tag_name] = [tag.tag_name, tag.tag_type, tag.ambiguous];
					}
				}
			);
		}, null, function() {
			callback(tags.map(function(tag) {return rich_tags[tag] || [tag, 0, 0];}));
		});
	},

	onSubmit: function(search_type, tags)
	{
		var context = this.getContext(search_type);
		var context_n = context.concat('__NEG__');
		if (search_type == 'update') {
			var old_tags = {};
			document.getElementById('post_old_tags').value.split(' ').forEach(function(tn) { old_tags[tn] = true; });
			tags = tags.filter(function(tag) { return !(tag[0] in old_tags); });
		}

		var tag_ctxs = {};
		var spec_ctxs = {};
		for (var i = 0; i < tags.length; i++) {
			var tag_name = tags[i][0].toLowerCase();
			var prefix = tags[i][1];
			var is_tag = true;
			var tag_ctx = context;
			if (prefix !== '') {
				prefix = prefix.toLowerCase();
				is_tag = this.tag_prefix_re.test(prefix);
				if (prefix.charAt(0) == '-') {
					tag_ctx = context_n;
					prefix = prefix.slice(1);
				}
			}
			if (is_tag)
				tag_ctxs[tag_name] = tag_ctx;
			else
				spec_ctxs[prefix] = [tag_name, tag_ctx];
		}

		return this.update_context(search_type, context_n, tag_ctxs, spec_ctxs);
	},

	getRelated: function(tag, callback)
	{
		// Will only work if the booru is running from the top level.
		var uri = document.location.protocol + '//' + document.location.host + '/tag/related.xml';
		uri += '?tags=' + encodeURIComponent(tag);

		var request = new XMLHttpRequest();
		request.open('GET', uri);

		var o = this;
		request.onreadystatechange = function(event) {
			if (this.readyState == 4) {
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

					o.enhanceTags(tags, function(etags) { callback(tag, etags); });
				} else {
				}
			}
		};
		request.send(null);
	},

	openBrowserTab: function(tag)
	{
		// This is never called, browsers don't support middle/right click on list boxes.
	}
};


function danbooruUpInit()
{
	danbooruUpDBUpdater.init();
	danbooruUpCompleter.database = danbooruUpDBUpdater.database;
	danbooruUpCompleter.update_context = function(st, uc, tc, sc) { return danbooruUpDBUpdater.onSubmit(st, uc, tc, sc); }
	if (localStorage.danbooruUpEnable != 'true')
		return;

	var script_arr = [];
	
// Insert the other script functions.
try {
for (var i=0; i < script_arr.length; i++)
{
	var s = document.createElement("script");
	s.setAttribute("type","text/javascript;version=1.7");
	s.appendChild(document.createTextNode(
			"//<![CDATA[\n" +
			script_arr[i]
			+ "\n//]]>"
			)
		);
	document.getElementsByTagName("head")[0].appendChild(s);
}
}catch(e){GM_log("danbooruUp: while injecting scripts: "+e);}


// create the CSS
var cssdec = '.danbooru-autocomplete { border: 1px solid black; overflow: auto; background: #fff; min-height: 1em; z-index: 1000 !important; ' +
	'width: 20em; position: absolute;}\n';

// tag style rules
for (rule in style_arr) {
	cssdec += ".danbooru-autocomplete .danbooru-tagtype-" + (/\.selected$/.test(rule) ? rule[0] + '[selected="selected"]' : rule) +
		" { " + style_arr[rule] + " }\n";
}

// add the CSS
var style = document.createElement("style");
style.appendChild(document.createTextNode(cssdec));
document.getElementsByTagName("head")[0].appendChild(style);



function danbooruUpACAttacher(id, search_type)
{
	var el = document.getElementById(id);
	if (!el)
		return;

	if (!search_type) {
		if (id == 'post_tags')
			search_type = document.getElementById('post_old_tags') ? 'update' : 'post';
		else
			search_type = 'search';
	}

	el.setAttribute('autocomplete', 'off');
	var ac = new AutoCompleter(el, danbooruUpCompleter, danbooruACHTMLPopup, search_type);

	var form = el;
	while (form.tagName != 'FORM')
		form = form.parentNode;
	form.addEventListener('submit', function(ev) { ac.onSubmit(); }, false);
}

function inhibitForm(id) {
	var el = document.getElementById(id);
	if (!el)
		return;
	// There's some javascript trickery going on that takes our enter key,
	// so do some trickery on our own.
	submit = el.submit;
	var stopf = function() {
		var target = null;
		try {
			target = stopf.caller.arguments[0].target;
		} catch (e) { 
			target = el.getElementsByTagName('textarea')[0];
		}
		if (target && target.danbooruUpAutoCompleter) {
			// Inform autocompleter of submission and allow it to cancel action.
			if (!target.danbooruUpAutoCompleter.onEnter()) {
				target.danbooruUpAutoCompleter.onSubmit();
				submit.call(el);
			}
		}
	};
	el.submit = stopf;
	//alert('tried to inhibit ' + id);
}

// Shrink the div around the input box on the front page so the popup won't go off to the left
if (document.location.pathname == '/') {
	try {
		var inp = document.getElementById('tags');
		inp.parentNode.style.display = 'table-cell';
		var div = inp.parentNode.parentNode.parentNode;
		div.style.display = 'table';
		div.style.margin = '0 auto 2em';
		
	} catch (e) { };
}

inhibitForm('edit-form');	// Post view and upload
danbooruUpACAttacher('tags');	// Front and side
danbooruUpACAttacher('post_tags');	// Post view and upload
danbooruUpACAttacher('tag_name', 'search_single');	// Tag edit
danbooruUpACAttacher('tag_alias_name', 'search_single');	// Tag alias
danbooruUpACAttacher('tag_alias_alias', 'search_single');	// Tag alias
danbooruUpACAttacher('tag_implication_predicate', 'search_single');	// Tag alias
danbooruUpACAttacher('tag_implication_consequent', 'search_single');	// Tag alias
danbooruUpACAttacher('user_blacklisted_tags');	// Tag alias
danbooruUpACAttacher('user_uploaded_tags');	// Tag alias

if (document.location.href.match(/\/tag(\/|\?|$)/)) {	// Tag search
	danbooruUpACAttacher('name', 'search_single');
}
if (document.location.href.match(/\/tag_(alias|implication)(\/|\?|$)/)) {	// Tag alias/implication
	danbooruUpACAttacher('query', 'search_single');
}
if (document.location.href.match(/\/wiki(\/|$)/)) {
	danbooruUpACAttacher('search-box');	// Wiki side bar
	danbooruUpACAttacher('wiki_page_title', 'search_single');	// Wiki add
}
if (document.location.href.match(/\/tag_subscription(\/|$)/)) {
	// User subscriptions. Tricky.
	// TODO: Bind new fields as they're ajax-added
	var subscriptionInputs = document.getElementsByTagName('input');
	for (var i = 0; i < subscriptionInputs.length; i++) {
		if (subscriptionInputs[i].id.match(/tag_query/))
			danbooruUpACAttacher(subscriptionInputs[i].id);
	}
}

}


/*
 * GUI scripting to extend a textbox into an tag autocompleter.
 * Should in theory have used XBL to extend a widget, but this is much easier.
 */

var AutoCompleter = function(textfield, completer, createPopup, search_type)
{
	this._textfield = textfield;
	this._completer = completer;
	// Search types: search, search_single, post, update
	this._search_type = search_type;
	this._tag_parser = this.tagParser.getParser(search_type);

	this._textfield.danbooruUpAutoCompleter = this;

	this._popup = new createPopup(textfield);
	this._listbox = this._popup.listbox;

	// The list box sometimes doesn't seem to acquire all its methods before it's been shown once...
	this._popup.openPopup();
	this._popup.hidePopup();

	var o = this;
	this._showSugg = function(tag, suggestions) { o.showSuggestions(tag, suggestions); };
	this._showRel = function(tag, related) { o.showRelated(tag, related); };
	this._textfield.addEventListener('keypress', function(event) { o.onKeyPress(event); }, false);
	this._textfield.addEventListener('keydown', function(event) { o.onKeyDown(event); }, false);
	this._textfield.addEventListener('keyup', function(event) { o.onKeyUp(event); }, false);
	this._textfield.addEventListener('input', function(event) { o.onInput(event); }, false);
	this._textfield.addEventListener('blur', function(event) { o._popup.timedHide(); }, false);
	this._textfield.addEventListener('focus', function(event) { o._popup.cancelHide(); }, false);
	this._listbox.addEventListener('focus', function(event) { o._textfield.focus(); }, false);
	this._listbox.addEventListener('click', function(event) { o.onClick(event); }, false);
};

AutoCompleter.prototype = {
	tag_classes: [
		'danbooru-tagtype-0',
		'danbooru-tagtype-0 danbooru-tagtype-1',
		'danbooru-tagtype-2',
		'danbooru-tagtype-0 danbooru-tagtype-3',
		'danbooru-tagtype-0 danbooru-tagtype-4',
	],
	ignoreKeypress: false,
	ignoreEnter: false,
	ctrlKey: false,
	reject_prefix: null,

	tagParser: {
		searchParser: function(tag)
		{
			var search_re = /^(:?|user|fav|md5|-?rating|source|id|width|height|score|mpixels|filesize|date|gentags|arttags|chartags|copytags|status|approver|order|parent|unlocked|sub|pool):|-|~/i;
			var match = search_re.exec(tag);
			var prefix = match ? match[0] : '';
			return [tag.slice(prefix.length), prefix];
		},

		searchSingleParser: function(tag)
		{
			return [tag, ''];
		},

		postParser: function(tag)
		{
			var post_re = /^ambiguous:|^(:?(:?ambiguous:)?(:?general|artist|char(?:acter)?|copy(?:right)?)):|^rating:|^parent:|^pool:/i;
			var match = post_re.exec(tag);
			var prefix = match ? match[0] : '';
			return [tag.slice(prefix.length), prefix];
		},

		updateParser: function(tag)
		{
			var update_re = /^ambiguous:|^(:?(:?ambiguous:)?(:?general|artist|char(?:acter)?|copy(?:right)?)):|^rating:|^parent:|^-?pool:/i;
			var match = update_re.exec(tag);
			var prefix = match ? match[0] : '';
			return [tag.slice(prefix.length), prefix];
		},

		getParser: function(search_type)
		{
			switch (search_type) {
				case 'search':
					return this.searchParser;
				case 'search_single':
					return this.searchSingleParser;
				case 'post':
					return this.postParser;
				case 'update':
					return this.updateParser;
			}
		},
	},

	// Listens on the list box for mouse events.
	onClick: function(event)
	{
		// Ignore clicks that don't hit a list item.
		var orgSource = this._popup.isClick(event);
		if (!orgSource)
			return;

		if (event.button == 2) {
			this._completer.openBrowserTab(orgSource.value);
		} else {
			this.replaceCurrentTag(orgSource.value);
			if (!event.ctrlKey)
				this.hidePopup();
			else
				this._popup.openPopup();
		}
	},

	// Listens on the text input field for keypress events.
	onKeyDown: function(event)
	{
		this.lastKeyCode = event.keyCode;
		if (event.keyCode == KeyEvent.DOM_VK_CONTROL)
			this.ctrlKey = true;
	
		this.onKeyPress(event);
	},

	onKeyUp: function(event)
	{
		if (event.keyCode == KeyEvent.DOM_VK_CONTROL)
			this.ctrlKey = false;
	},

	onKeyPress: function(event)
	{
		if (this.ignoreKeypress)
			return;
		// Ignore enter events that come in too quick succession.
		if (this.lastKeyCode == KeyEvent.DOM_VK_RETURN && this.ignoreEnter > new Date()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}


		var lb = this._listbox;
		var moved = true;


		// Handle some keys for the autocomplete list.
		if (this._popup.state == 'open') {
			//switch (event.keyCode) {
			switch (this.lastKeyCode) {
				case KeyEvent.DOM_VK_UP:
					if (lb.selectedIndex == -1 || lb.selectedIndex == 0)
						lb.selectedIndex = lb.itemCount - 1;
					else
						lb.selectedIndex -= 1;
					break;
				case KeyEvent.DOM_VK_DOWN:
					if (lb.selectedIndex == -1 || lb.selectedIndex == lb.itemCount - 1)
						lb.selectedIndex = lb.itemCount ? 0 : -1;
					else
						lb.selectedIndex += 1;
					break;
				case KeyEvent.DOM_VK_PAGE_UP:
					if (lb.itemCount)
						lb.selectedIndex = Math.max(0, lb.selectedIndex - lb.getNumberOfVisibleRows());
					break;
				case KeyEvent.DOM_VK_PAGE_DOWN:
					lb.selectedIndex = Math.min(lb.itemCount - 1, lb.selectedIndex + lb.getNumberOfVisibleRows());
					break;

				case KeyEvent.DOM_VK_INSERT:
				case KeyEvent.DOM_VK_HELP:
				case KeyEvent.DOM_VK_E:
					if (this.lastKeyCode == KeyEvent.DOM_VK_E && !event.ctrlKey) {
						moved = false;
						break;
					}
					if (this._listbox.selectedIndex != -1) {
						this._completer.getRelated(this._listbox.selectedItem.value, this._showRel);
					} else {
						var cur_tag = this.getTagAtCursor()[0];
						if (cur_tag)
							this._completer.getRelated(cur_tag, this._showRel);
					}
					break;

				case KeyEvent.DOM_VK_RETURN:
					if (lb.selectedIndex != -1)
						this.replaceCurrentTag(lb.selectedItem.value);
					if (!event.ctrlKey) {
						lb.selectedIndex = -1;
						this.hidePopup();
					}
					this.ignoreEnter = new Date();
					this.ignoreEnter.setMilliseconds(this.ignoreEnter.getMilliseconds() + 100);
					break;
				case KeyEvent.DOM_VK_ESCAPE:
					this.hidePopup();
					break;

				default:
					moved = false;
					break;
			}
			if (moved) {
				event.preventDefault();
				event.stopPropagation();
			}
			if (moved && lb.selectedIndex != -1) {
				lb.ensureIndexIsVisible(lb.selectedIndex);
				// Works around some weirdness with assignment to lb.selectedIndex
				lb.selectedItem = lb.getItemAtIndex(lb.selectedIndex);
			}
		} else {
			//switch (event.keyCode) {
			switch (this.lastKeyCode) {
				case KeyEvent.DOM_VK_INSERT:
				case KeyEvent.DOM_VK_HELP:
				case KeyEvent.DOM_VK_E:
					if (this.lastKeyCode == KeyEvent.DOM_VK_E && !event.ctrlKey) {
						moved = false;
						break;
					}
					var cur_tag = this.getTagAtCursor()[0];
					if (cur_tag)
						this._completer.getRelated(cur_tag, this._showRel);
					break;
				case KeyEvent.DOM_VK_DOWN:
					var tag = this.getTagAtCursor();
					this._completer.getSuggestions(tag[0], tag[1], this._search_type, this._showSugg);
					this.openPopup();
					break;
				case KeyEvent.DOM_VK_SPACE:
					// Abort a autocomplete that may not have fired yet.
					this.hidePopup();
					moved = false;
					break;
				default:
					moved = false;
					break;
			}
		}
		if (moved) {
			event.preventDefault();
			event.stopPropagation();
		}
	},

	// Used when the enter press is intercepted elsewhere.
	// Returns true if the default action should be stopped.
	onEnter: function()
	{
		this.lastKeyCode = KeyEvent.DOM_VK_RETURN;
		ev = { stop: false, keyCode: KeyEvent.DOM_VK_RETURN, ctrlKey: this.ctrlKey,
			preventDefault: function() { this.stop = true; }, stopPropagation: function() {}
		};
		this.onKeyPress(ev);
		return ev.stop;
	},

	// Listens on the text input field for input (= potential autocompletion task)
	onInput: function(event)
	{
		// Don't start a search that will get canceled and cause an exception when submitting.
		if (this.lastKeyCode == KeyEvent.DOM_VK_RETURN)
			return;
		// Chrome seems to fire this event early, so we still get a tag after the first space.
		if (this.lastKeyCode == KeyEvent.DOM_VK_SPACE && this._popup.state == 'open') {
			this._popup.timedHide();
			return;
		}
		var tag = this.getTagAtCursor();
		if (tag[1].toLowerCase() !== this.reject_prefix && (tag[0] || tag[1])) {
			this._completer.getSuggestions(tag[0], tag[1], this._search_type, this._showSugg);
			this.openPopup()
		} else if (this._popup.state == 'open') {
			this._popup.timedHide();
		}
	},

	// Give tags and search type to completer so it can update the tag history.
	onSubmit: function()
	{
		var tags = this._textfield.value.replace(/^\s+|\s+$/g, '').split(/\s+/);
		this._completer.onSubmit(this._search_type, tags.map(this._tag_parser));
	},

	// Called by the completer to deliver requested suggestions.
	showSuggestions: function(tag, suggestions)
	{
		var lb = this._listbox;
		// Let the completer refuse to submit suggestions for a prefix by suggesting null.
		if (suggestions === null) {
			this.reject_prefix = tag;
			this.hidePopup();
			return;
		} else {
			this.reject_prefix = null;
		}
		var selected = (this._popup.state == 'open' && lb.selectedIndex != -1) ? lb.selectedItem.value : null;

		var newSelectedIndex = this._popup.insertTags(suggestions, '', selected, this.tag_classes, -1);
		//N

		this.openPopup();
		if (newSelectedIndex != -1) {
			// Preserve old selection if still found.
			lb.selectedIndex = newSelectedIndex;
			lb.ensureIndexIsVisible(lb.selectedIndex);
			// Works around weirdness /w assigning to selectedIndex
			lb.selectedItem = lb.getItemAtIndex(lb.selectedIndex);
		} else if (suggestions.length > 0) {
			// If not, but the first tag is a partial match, select it.
			var cur_tag = this.getTagAtCursor()[0];
			if (suggestions[0][0].length >= cur_tag.length && cur_tag == suggestions[0][0].substr(0, cur_tag.length)) {
				lb.selectedIndex = 0;
				// Works around weirdness /w assigning to selectedIndex
				lb.ensureIndexIsVisible(lb.selectedIndex);
				lb.selectedItem = lb.getItemAtIndex(lb.selectedIndex);
			}
		} else {
			lb.selectedIndex = -1;
		}

	},

	// Called by the completer to deliver requested related tag information.
	showRelated: function(tag, related)
	{
		var lb = this._listbox;
		var position = -1;	// Where to insert
		// Find the instance of the tag closest to the cursor
		// (A tag can occur more than once if we've searched for related tags before.)
		if (this._popup.state == 'open') {
			var cur_pos = Math.max(lb.selectedIndex, 0);
			var closest = lb.itemCount;
			for (var i = 0; i < lb.itemCount; i++) {
				if (lb.getItemAtIndex(i).value == tag && Math.abs(i - cur_pos) < closest) {
					position = i;
					closest = Math.abs(i - cur_pos);
				}
			}
		}

		if (position == -1)
			// Either popup not open, or couldn't find tag in current list. So make new list.
			this.showSuggestions('', related);
		else {
			var item = lb.getItemAtIndex(position);
			// Add some indentation to whatever there were.
			var indent = this._popup.getIndent(position) + '\u00a0\u00a0';	// non-breaking space.

			// The requested tag is probably in there itself, filter it.
			this._popup.insertTags(related.filter(function(x) {return x[0] != tag;}), indent, null, this.tag_classes, position);

			lb.ensureIndexIsVisible(position);
			lb.selectedIndex = position;
			lb.selectedItem = lb.getItemAtIndex(position);
		}
	},

	getTagBoundsAtCursor: function()
	{
		if (this._textfield.selectionStart != this._textfield.selectionEnd)
			return [-1, -1];

		var v = this._textfield.value;
		var from = this._textfield.selectionStart;
		var to = from;

		while (from > 0 && /\S/.test(v[from-1]))
			from--;
		while (to < v.length && /\S/.test(v[to]))
			to++;
		return [from, to];
	},

	// Get the tag the caret is currently positioned over and the tag prefix, as [tag, prefix]
	getTagAtCursor: function()
	{
		var from, to;
		// In memory of Opera's destructuring assignment support. 9.5 - 10.50
		// [from, to] = this.getTagBoundsAtCursor();
		var bounds = this.getTagBoundsAtCursor();
		from = bounds[0]; to = bounds[1];
		// Something is selected?
		if (from === -1)
			return ['', ''];

		var value = this._textfield.value.slice(from, to);
		return this._tag_parser(value);
	},

	// Replace the tag the caret is currently positioned over, keeping tag prefixes.
	replaceCurrentTag: function(replacement)
	{
		var from, to;
		var bounds = this.getTagBoundsAtCursor();
		from = bounds[0]; to = bounds[1];
		if (from === -1)
			return;
		if (this._search_type != 'search_single')
			replacement += ' ';

		var v = this._textfield.value;
		var current_tag = this._tag_parser(v.slice(from, to));
		from += current_tag[1].length
		this._textfield.value = v.slice(0, from) + replacement + v.slice(to);

		// Update caret position
		var newend = from + replacement.length;
		this._textfield.setSelectionRange(newend, newend);
		this._textfield.focus();

		// Ignore any simulated keypresses during scrolling.
		this.ignoreKeypress = true;
		// Scroll to caret position
		this._popup.scrollText(this._textfield);
		this.ignoreKeypress = false;
	},

	hidePopup: function()
	{
		this._popup.hidePopup();
		this._completer.abortSuggestion();
	},

	openPopup: function()
	{
		if (this._popup.state != 'open') {
			this._popup.openPopup();
			this._listbox.selectedIndex = -1;
		}
	}
};

// Makes the autocompleter work in HTML DOM

var danbooruACHTMLPopup = function(textfield) {
	this.div = document.createElement('div');
	this.div.setAttribute("class", "danbooru-autocomplete");
	this.listbox = document.createElement('select');
	this.div.appendChild(this.listbox);
	textfield.parentNode.insertBefore(this.div, textfield.nextSibling);

	this.listbox.size = 10;
	this.listbox.style.width = '100%';

	this.div.style.display = 'inline';

	textfield.inputField = textfield;
	danbooruACExtendSelect(this.listbox);
};

// XULify HTML selects to be more like listboxes.
function danbooruACExtendSelect()
{
	var pt = HTMLSelectElement.prototype;
	pt.getNumberOfVisibleRows = function() {
		return this.size;
	};

	pt.ensureIndexIsVisible = function(x) {
		// Pass
	};

	pt.getItemAtIndex = function(x) {
		return this.options[x];
	};

	pt.__defineGetter__('itemCount', function() {
		return this.length;
	});

	pt.__defineGetter__('selectedItem', function() {
		return this.options[this.selectedIndex];
	});
	pt.__defineSetter__('selectedItem', function(x) {
		// Pass
	});
}

danbooruACHTMLPopup.prototype = {
	state: 'hidden',
	timer: null,

	openPopup: function()
	{
		this.cancelHide();
		this.div.style.display = 'block';
		this.state = 'open';
	},

	hidePopup: function()
	{
		this.div.style.display = 'none';
		this.state = 'hidden';
	},

	// Hide after a certain time if cancelHide or openPopup isn't called by then.
	timedHide: function()
	{
		if (this.timer)
			return;
		var o = this;
		this.timer = window.setTimeout(function() { o.timer = null; o.hidePopup(); }, 200);
	},

	cancelHide: function()
	{
		if (this.timer) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
	},

	// Called by the autocompleter to figure whether an onclick was on target.
	isClick: function(event)
	{
		var source = event.target;
		while (source && source.tagName != 'OPTION') {
			source = source.parentNode;
		}
		return source;
	},

	getIndent: function(position)
	{
		return this.listbox.options[position].indent;
	},

	insertTags: function(tags, indent, search, tagclasses, position)
	{
		var tc = tagclasses;
		var lb = this.listbox;
		var searchRes = -1;

		if (position == -1) {
			while (lb.length)
				lb.remove(0);
		}
		var insertBefore = lb.options[position + 1];

		for (var i = 0; i < tags.length; i++) {
				var x = tags[i];
				var li = document.createElement('option');
				li.value = x[0];
				li.setAttribute('class', tc[x[1]] + (x[2] ? ' ' + tc[2] : ''));
				li.appendChild(document.createTextNode(indent ? indent + x[0] : x[0]));
				li.indent = indent;
				lb.add(li, insertBefore);
				if (search === x[0] && searchRes === -1)
					searchRes = i;
		}

		return searchRes;
	},

	// Scroll the textfield to the cursor position.
	scrollText: function(textfield)
	{
		try {
			// Send a escape keypress.
			evt = document.createEvent("KeyboardEvent");
			evt.initKeyEvent('keypress', false, false, window, false, false, false, false, KeyEvent.DOM_VK_ESCAPE, 0);
			textfield.dispatchEvent(evt);
		} catch (e) {
			// Can't send key events in Opera... Can't scroll the input field at all...
		}
	}
};



if (document.readyState == 'complete' || !window.opera)
	danbooruUpInit();
else
	document.addEventListener('DOMContentLoaded', function(e) { danbooruUpInit(); }, false);


})();