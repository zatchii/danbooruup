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
	this._textfield.addEventListener('keydown', function(event) { o.onKeyDown(event); }, false);
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
		'danbooru-tagtype-0 danbooru-tagtype-5',
		'danbooru-tagtype-0 danbooru-tagtype-6',
		'danbooru-tagtype-0 danbooru-tagtype-7',
	],
	ignoreKeypress: false,
	ignoreEnter: false,
	reject_prefix: null,
	disabled: false,

	search_prefixes: [
		'ordfav:',
		'fastfav:',
		//'unlocked:',
		'user:',
		'approver:',
		'commenter:',
		//'comm:',
		'noter:',
		'pool:',
		'fav:',
		'sub:',
		'md5:',
		'rating:',
		'locked:',
		'width:',
		'height:',
		'mpixels:',
		'score:',
		'favcount:',
		'filesize:',
		'source:',
		//'id:',
		'date:',
		'order:',
		'status:',
		'tagcount:',
		'gentags:',
		'arttags:',
		'chartags:',
		'copytags:',
		'parent:',
		'pixiv_id:',
		//'pixiv:',
	],

	tagParser: {
		searchParser: function(tag)
		{
			// ordfav, fastfav and unlocked are from Danbooru 1. The rest are either both or Danbooru 2 only
			var search_re = /^(ordfav|fastfav|unlocked|-user|user|-approver|approver|commenter|comm|noter|-pool|pool|-fav|fav|sub|md5|-rating|rating|-locked|locked|width|height|mpixels|score|favcount|filesize|source|id|date|order|-status|status|tagcount|gentags|arttags|chartags|copytags|parent|-parent|pixiv_id|pixiv):|^-|^~/i;
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
			var post_re = /^ambiguous:|^(?:(?:ambiguous:)?(?:gen|general|art|artist|co|copy|copyright|ch|char|character)):|^rating:|^parent:|^pool:/i;
			var match = post_re.exec(tag);
			var prefix = match ? match[0] : '';
			return [tag.slice(prefix.length), prefix];
		},

		updateParser: function(tag)
		{
			var update_re = /^ambiguous:|^(?:(?:ambiguous:)?(?:gen|general|art|artist|co|copy|copyright|ch|char|character)):|^rating:|^parent:|^-?pool:/i;
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
				default:
					return this.searchParser;
			}
		},
	},

	// Get a list of prefixes the query is a prefix of.
	getPrefixes: function(query)
	{
		if (!(/^[a-z]+$/).test(query))
			return [];
		query_re = new RegExp('^' + query);
		return this.search_prefixes.filter(function(x) {return query_re.test(x);})
			.map(function(x) {return [x, 0, 0];});
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
			var isPrefix = this.search_prefixes.indexOf(orgSource.value) != -1;

			this.replaceCurrentTag(orgSource.value, isPrefix);

			if (isPrefix)
				this.doTagSearch();

			if (!event.ctrlKey && !isPrefix)
				this.hidePopup();
			else
				this._popup.openPopup();
		}
	},

	// Listens on the text input field for keypress events.
	onKeyDown: function(event)
	{
		this.lastKeyCode = event.keyCode;

		if (this.ignoreKeypress || this.disabled)
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
						let cur_tag = this.getTagAtCursor()[0];
						if (cur_tag)
							this._completer.getRelated(cur_tag, this._showRel);
					}
					break;
				case KeyEvent.DOM_VK_TAB:
					// Complete with first suggested item.
					// Ignore tab if complete-with-tab is off.
					if (!this._completer.prefCompleteWithTab()) {
						moved = false;
						break;
					}
					// Select first item if nothing selected
					if (lb.selectedIndex == -1 && lb.itemCount > 0) {
						lb.selectedIndex = 0;
					}

					// FALLTHROUGH!
				case KeyEvent.DOM_VK_RETURN:
					var isPrefix = false;

					if (lb.selectedIndex != -1) {
						if (this.search_prefixes.indexOf(lb.selectedItem.value) != -1)
							isPrefix = true;

						this.replaceCurrentTag(lb.selectedItem.value, isPrefix);

						if (isPrefix)
							this.doTagSearch();
					}
					else if (this._completer.prefCompleteWithTab())
						// If complete-with-tab is on, do default action if nothing is selected.
						moved = false;

					if (!event.ctrlKey && !isPrefix) {
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
			switch (this.lastKeyCode) {
				case KeyEvent.DOM_VK_INSERT:
				case KeyEvent.DOM_VK_HELP:
				case KeyEvent.DOM_VK_E:
					if (this.lastKeyCode == KeyEvent.DOM_VK_E && !event.ctrlKey) {
						moved = false;
						break;
					}
					let cur_tag = this.getTagAtCursor()[0];
					if (cur_tag)
						this._completer.getRelated(cur_tag, this._showRel);
					break;
				case KeyEvent.DOM_VK_DOWN:
					this.doTagSearch();
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

	// Listens on the text input field for input (= potential autocompletion task)
	onInput: function(event)
	{
		if (this.disabled)
			return;
		// Don't start a search that will get canceled and cause an exception when submitting.
		if (this.lastKeyCode == KeyEvent.DOM_VK_RETURN)
			return;
		// Don't start a new search when closing the popup.
		if (this.lastKeyCode == KeyEvent.DOM_VK_ESCAPE)
			return;
		// Chrome seems to fire this event early, so ignore the tag that's still found after pressing space.
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

	doTagSearch: function(event)
	{
		var tag = this.getTagAtCursor();
		this._completer.getSuggestions(tag[0], tag[1], this._search_type, this._showSugg);
		this.openPopup();
	},

	// Give tags and search type to completer so it can update the tag history.
	onSubmit: function()
	{
		if (this.disabled)
			return;
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

		if (this._search_type == 'search' && this._completer.prefSuggestPrefixes()) {
			var prefix = this.getTagAtCursor()[1];
			if (['', '-'].indexOf(prefix) !== -1) {
				suggestions = this.getPrefixes(tag).concat(suggestions);
			}
		}

		var selected = (this._popup.state == 'open' && lb.selectedIndex != -1) ? lb.selectedItem.value : null;

		var newSelectedIndex = this._popup.insertTags(suggestions, '', selected, this.tag_classes, -1);

		this.openPopup();
		if (newSelectedIndex != -1) {
			// Preserve old selection if still found.
			lb.selectedIndex = newSelectedIndex;
			lb.ensureIndexIsVisible(lb.selectedIndex);
			// Works around weirdness /w assigning to selectedIndex
			lb.selectedItem = lb.getItemAtIndex(lb.selectedIndex);
		} else if (suggestions.length > 0 && !this._completer.prefCompleteWithTab()) {
			// If not, but the first tag is a partial match, select it.
			// But only if not in complete-with-tab mode.
			let cur_tag = this.getTagAtCursor()[0];
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
			let cur_pos = Math.max(lb.selectedIndex, 0);
			let closest = lb.itemCount;
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
			let item = lb.getItemAtIndex(position);
			// Add some indentation to whatever there were.
			let indent = this._popup.getIndent(position) + '\u00a0\u00a0';	// non-breaking space.

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
	replaceCurrentTag: function(replacement, isPrefix)
	{
		var from, to;
		var bounds = this.getTagBoundsAtCursor();
		from = bounds[0]; to = bounds[1];
		if (from === -1)
			return;
		if (this._search_type != 'search_single' && !isPrefix)
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
