// ==UserScript==
	// @include http://danbooru.donmai.us/post/show/*
	// @include http://safebooru.donmai.us/post/show/*
// ==/UserScript==
/**
 * Shows the note history of a post on-page when the user presses Ctrl + Shift + S
 *
 * Recommend renaming to danbooruNoteHistory.js if using with Opera.
 */

(function () {

	// Drop privileges in Greasemonkey
	if (typeof window.wrappedJSObject == "object") {
	  location.href = "javascript:(" + encodeURI(arguments.callee.toSource()) + ")();";
	  return;
	}

	var usernames = {};
	var temp_names = {};
	function get_user_name(id) {
		if (window.localStorage && localStorage['dbnh_user_' + id])
			return localStorage['dbnh_user_' + id];
		if (id in usernames)
			return usernames[id];
		var node = document.createTextNode('User ' + id);
		if (id in temp_names) {
			temp_names[id].push(node);
		} else {
			temp_names[id] = [node];
			send_json_request('user/index.json?id=' + id, function(user) {
				usernames[id] = user[0].name;
				if (window.localStorage)
					window.localStorage['dbnh_user_' + id] = user[0].name
				temp_names[id].forEach(function(textNode) {
					textNode.data = user[0].name;
				});
			});
		}
		return node;
	}

	function id_to_color(id) {
		return 'rgb(' + (id & 255) + ', ' + (id >> 8 & 255) + ', ' + (id >> 16 & 255) + ')';
	}

	function format_time(d) {
		var d_ = new Date(d);
		d_.setHours(d_.getHours() - 4); // Skew the date to get UTC-4h
		var y = d_.getUTCFullYear();
		var m = d_.getUTCMonth() + 1;
		var d = d_.getUTCDate();
		if (m < 10) m = '0' + m;
		if (d < 10) d = '0' + d;

		var h = d_.getUTCHours();
		var i = d_.getUTCMinutes();
		if (h < 10) h = '0' + h;
		if (i < 10) i = '0' + i;

		return y + '-' + m + '-' + d + ' ' + h + ':' + i;
	}

	function dom_link(text, url) {
		var a = document.createElement('a');
		a.href = url;
		if (typeof(text) == 'string' || typeof(text) == 'number')
			text = document.createTextNode(text);
		a.appendChild(text);
		return a;
	}

	function dom_td(content) {
		var td = document.createElement('td');
		if (content) {
			if (typeof(content) == 'string' || typeof(text) == 'number')
				content = document.createTextNode(content);
			td.appendChild(content);
		}
		return td;
	}

	/* Do a string diff by performing a longest common subsequence search.
	 * Returns a list of changes from str2 to str1 like [[0, 'common'], [-1, 'deleted'], [1, 'added']]
	 */
	function string_diff(str1, str2) {
		// First check for common prefixes and suffixes
		if (str1 == str2)
			return [[0, str1]];
		var prefix, suffix;
		var i = 0;
		while (i < str1.length && i < str2.length && str1[i] == str2[i])
			i++;
		if (i) {
			prefix = str1.slice(0, i);
			str1 = str1.slice(i);
			str2 = str2.slice(i);
		}
		i = 0;
		while (i < str1.length && i < str2.length && str1[str1.length - 1 - i] == str2[str2.length - 1 - i])
			i++;
		if (i) {
			suffix = str1.slice(-i);
			str1 = str1.slice(0, -i);
			str2 = str2.slice(0, -i);
		}


		var emptyrow = new Array(str1.length + 1);
		for (var k = 0; k < emptyrow.length; k++) emptyrow[k] = 0;

		// Fill in the table
		var table = [emptyrow.slice(0)];
		for (i = 0; i < str2.length; i++) {
			table.push(emptyrow.slice(0));
			for (var j = 0; j < str1.length; j++) {
				table[i+1][j+1] = Math.max(table[i][j+1], table[i+1][j], table[i][j] + ((str1[j] == str2[i]) ? 1 : 0));
			}
		}

		// Backtrack
		var pos1 = str1.length;
		var pos2 = str2.length;
		var str_ar;
		function add_pos(type, s) {
			if (!str_ar)
				str_ar = [[type, s]];
			else if (str_ar[str_ar.length-1][0] == type)
				str_ar[str_ar.length-1].push(s);
			else
				str_ar.push([type, s]);
		}
		while (pos1 && pos2) {
			var v = [table[pos2-1][pos1], table[pos2][pos1-1], table[pos2-1][pos1-1]]
			var max = Math.max(v[0], v[1], v[2]);
			if (max < table[pos2][pos1]) {
				add_pos(0, str1[pos1-1]);
				pos1--; pos2--;
			} else if (v[1] == max) {
				add_pos(1, str1[pos1-1]);
				pos1--;
			} else {
				add_pos(-1, str2[pos2-1]);
				pos2--;
			}
		}
		if (pos1)
			add_pos(1, str1.slice(0, pos1));
		if (pos2)
			add_pos(-1, str2.slice(0, pos2));

		// Reverse
		str_ar.reverse();
		var segments = str_ar.map(function(x) {
			var content = x.slice(1);
			content.reverse();
			return [x[0], content.join('')];
		});
		// Add common prefix/suffixes
		if (prefix)
			segments.unshift([0, prefix]);
		if (suffix)
			segments.push([0, suffix]);
		return segments;
			
	}

	/* Insert zero-width spaces into long words to help with word wrapping */
	function zerospace(text) {
		return text.replace(/\w{40}/g, '$&\u200B');
	}

	/* Return a formatted diff of two notes */
	function note_diff(str, prev_str) {
		var frag = document.createDocumentFragment();

		var diff = string_diff(str, prev_str);
		diff.forEach(function(x) {
			var node;
			switch (x[0]) {
			case -1:
				node = document.createElement('del');
				break;
			case 1:
				node = document.createElement('ins');
				break;
			case 0:
				node = document.createElement('span');
				break;
			}
			node.appendChild(document.createTextNode(zerospace(x[1])));
			frag.appendChild(node);
		});

		return frag;
	}

	function note_delta(note, prev_note) {
		var changes = [];
		['x', 'y', 'width', 'height'].forEach(function(attr) {
			var delta = note[attr] - prev_note[attr];
			if (delta != 0)
				changes.push(attr[0] + ':' + (delta > 0 ? '+':'') + delta);
		});
		return changes.join(', ');
	}

	function dom_note_row(note, prev_note, version_bounds) {
		var tr = document.createElement('tr');
		tr.appendChild(dom_td()).style.background = id_to_color(note.post_id);
		tr.appendChild(dom_td(dom_link(note.post_id, '/post/show/' + note.post_id)));
		tr.appendChild(dom_td(dom_link(note.note_id + '.' + note.version, '/note/history/' + note.note_id)));
		if (prev_note && note.is_active) {
			tr.appendChild(dom_td(
				note_diff(note.body.replace(/\n/g, '\u00b6'),
					prev_note.body.replace(/\n/g, '\u00b6'))
			));
		} else {
			tr.appendChild(dom_td(zerospace(note.body.replace(/\n/g, '\u00b6') + (note.is_active ? '': ' (deleted)'))));
		}
		tr.appendChild(dom_td(dom_link(get_user_name(note.creator_id), '/user/show/' + note.creator_id)));
		tr.appendChild(dom_td(format_time(note.updated_at)));
		if (prev_note) {
			var delta = note_delta(note, prev_note)
			if (!delta && note.body == prev_note.body && note.is_active && prev_note.is_active)
				tr.appendChild(dom_td('NOP'))
			else
				tr.appendChild(dom_td(delta));
		} else {
			tr.appendChild(dom_td(''));
		}

		var revert_link;
		function revert(ev) {
			var form = document.getElementById('content').appendChild(document.createElement('form'));
			form.action = this.href;
			form.method = 'POST';
			form.submit();
			ev.preventDefault();
		}
		if (note.version == version_bounds[note.note_id][0] && note.version == version_bounds[note.note_id][1]) {
			revert_link = dom_link('Delete', '#');
			revert_link.addEventListener('click', function(ev) { Note.find(note.note_id).remove() }, true);
		} else if (note.version == version_bounds[note.note_id][1]) {
			revert_link = dom_link('Undo', '/note/revert/' + note.note_id + '?version=' + prev_note.version);
			revert_link.addEventListener('click', revert, true);
		} else {
			revert_link = dom_link('Revert', '/note/revert/' + note.note_id + '?version=' + note.version);
			revert_link.addEventListener('click', revert, true);
		}
		tr.appendChild(dom_td(revert_link));

		tr.note_version = [note.note_id, note.version];
		return tr;
	}

	// Create a note history table.
	function dom_history_table(history) {
		var table = document.createElement('table');
		table.className = 'row-highlight';
		table.width='100%';
		var thead = table.appendChild(document.createElement('thead'));
		[['', null], ['Post', 5], ['Note', 5], ['Body', 60], ['Edited By', 10], ['Date', 6], ['\u0394Pos', 5], ['Options', 5]].forEach(function (header) {
			var th = thead.appendChild(document.createElement('th'));
			th.appendChild(document.createTextNode(header[0]));
			if (header[1])
				th.width = header[1] + '%';
		});

		var version_bounds = {};
		var prev_notes = {};
		history.forEach(function(note) {
			if (!(note.note_id in version_bounds)) {
				version_bounds[note.note_id] = [note.version, note.version];
			} else {
				version_bounds[note.note_id][0] = Math.min(note.version, version_bounds[note.note_id][0]);
				version_bounds[note.note_id][1] = Math.max(note.version, version_bounds[note.note_id][1]);
				prev_notes[[note.note_id, prev_notes[note.note_id].version]] = note;
			}
			prev_notes[note.note_id] = note;
		});

		var tbody = table.appendChild(document.createElement('tbody'));
		var even = true;
		history.forEach(function(note) {
				tbody.appendChild(
					dom_note_row(note, prev_notes[[note.note_id, note.version]], version_bounds)
				).className = even ? 'even' : 'odd';
				even = !even;
		});

		table.addEventListener('mouseover', function(ev) {
				var target = ev.target;
				var deep = 3;
				while (target && target.localName != 'TR' && --deep) {
					target = target.parentNode;
				}
				if (!target || !deep)
					return;
				var note_version = target.note_version;
				var rows = target.parentNode.getElementsByTagName('tr');
				for (var i = 0; i < rows.length; i++) {
					if (rows[i].note_version == note_version)
						rows[i].style.backgroundColor = '#AEA';
					else if (rows[i].note_version[0] == note_version[0])
						rows[i].style.backgroundColor = '#CFC';
					else
						rows[i].style.backgroundColor = '';
				}
			},
			false
		);
		table.addEventListener('click', function(ev) {
				var target = ev.target;
				var deep = 3;
				while (target && target.localName != 'TR' && --deep) {
					if (target.localName == 'A')
						target = null;
					else
						target = target.parentNode;
				}
				if (!target || !deep)
					return;
				var note_version = target.note_version;
				select_note(note_version);
				var rows = target.parentNode.getElementsByTagName('tr');
				for (var i = 0; i < rows.length; i++) {
					rows[i].firstChild.style.border = '';
				}
				target.firstChild.style.border = '2px solid black';
			},
			false
		);

		var outerDiv = document.createElement('div');
		outerDiv.id = 'noteHistoryTable';
		outerDiv.style.clear = 'left';

		// Add 'Show diffs' checkbox
		var showDiffsLabel = outerDiv.appendChild(document.createElement('label'));
		showDiffsLabel.appendChild(document.createTextNode('Show diffs'));
		showDiffsLabel.setAttribute('for', 'noteHistoryDiffs');

		var showDiffs = outerDiv.appendChild(document.createElement('input'));
		showDiffs.id = 'noteHistoryDiffs';
		showDiffs.type = 'checkbox';
		showDiffs.addEventListener('change', function(ev) {
				var nodes = table.getElementsByTagName('del');
				for (var i = 0; i < nodes.length; i++)
					nodes[i].style.display = showDiffs.checked ? '' : 'none';
			},
			true
		);
		showDiffs.checked = true;

		outerDiv.appendChild(table);
		return outerDiv;
	}

	function image_ratio()
	{
		var image = document.getElementById('image');
		return image.width / image.getAttribute('data-orig_width');
	}

	var history = {};

	var selected_note;
	var position_box;

	// Show the position of a note specified as [id, version]
	function select_note(note_version) {
		if (selected_note)
			selected_note.elements.box.style.backgroundColor = '';

		if (position_box) {
			position_box.parentNode.removeChild(position_box);
			position_box = null;
		}


		// If there exists a note box with the right id and position, tint it.
		selected_note = Note.find(note_version[0]);
		var sn = selected_note ? selected_note.fullsize : {};
		var on = history[note_version];
		if (selected_note && sn.left == on.x && sn.top == on.y && sn.width == on.width && sn.height == on.height) {
			selected_note.elements.box.style.backgroundColor = '#FAA';
			document.location.hash = '#';
			selected_note.elements.box.scrollIntoView();
		} else {
			// If not, make a box.
			var ratio = image_ratio();
			var note_container = document.getElementById('note-container');
			// Insert before so other notes go in front of it.
			position_box = note_container.insertBefore(document.createElement('div'), note_container.firstChild);
			position_box.className = 'note-box';
			position_box.style.backgroundColor = '#AAF';
			position_box.style.opacity = 0.5;
			position_box.style.cursor = 'auto';

			position_box.style.left = on.x * ratio + 'px';
			position_box.style.top = on.y * ratio + 'px';
			position_box.style.width = on.width * ratio + 'px';
			position_box.style.height = on.height * ratio + 'px';
			document.location.hash = '#';
			position_box.scrollIntoView();
		}
	}

	function get_note_history(post_id, callback) {
		get_note_history_helper(post_id,
			function (history) {
				callback(history.map(function(x) { x.updated_at = new Date(x.updated_at.s * 1000); return x; }));
			},
			1,
			[]
		);
	}

	function get_note_history_helper(post_id, callback, page, history_store) {
		send_json_request('note/history.json?post_id=' + post_id + '&page=' + page,
			function (history) {
				history.forEach(
					function(x) {
						history_store.push(x);
					}
				);
				if (history.length < 50)
					callback(history_store);
				else
					get_note_history_helper(post_id, callback, page + 1, history_store);
			}
		);
	}

	// Send a GET request, call a callback with the json data on success, ignore errors.
	function send_json_request(path, callback) {
		var uri = document.location.protocol + '//' + document.location.host + '/' + path;
		var request = new XMLHttpRequest();
		request.open('GET', uri);

		var o = this;
		request.onreadystatechange = function(event) {
			if (this.readyState == 4) {
				if (this.status == 200) {
					var data = eval(request.responseText)
					callback(data);
				} else {
				}
			}
		};
		request.send(null);
	}


	document.addEventListener('keydown', function(ev) {
			if (!(ev.keyCode == 83 && ev.ctrlKey && ev.shiftKey))	// Ctrl + Shift + S
				return;

			var post_id = /\/post\/show\/(\d+)/.exec(document.location.pathname)[1];
			get_note_history(post_id, function(note_history) {
				// Save notes in global variable
				note_history.forEach(function(note) {history[[note.note_id, note.version]] = note;});

				// Remove any existing history table.
				var old_table = document.getElementById('noteHistoryTable')
				if (old_table)
					old_table.parentNode.removeChild(old_table);

				// Add history table.
				document.location.hash = '#';
				document.getElementById('content').appendChild(dom_history_table(note_history)).firstChild.scrollIntoView();
			});
		},
		false
	);

})();
