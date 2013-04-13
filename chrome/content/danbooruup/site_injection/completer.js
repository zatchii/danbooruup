var danbooruUpCompleter = {
	result: null,
	cur_tag: '',
	cur_prefix: '',
	cur_search_type: '',
	cur_callback: null,
	timer: null,

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

	// Called on time out, send the query.
	doSearch: function()
	{
		this.timer = null;
		var tag = this.cur_tag.toLowerCase();
		var prefix = this.cur_prefix.toLowerCase();
		var query = {"tag": tag, "prefix": prefix, "ctx" : this.getContext(this.cur_search_type)};

		this.sendRequest(query, 'search');
	},

	getContext: function(search_type)
	{
		if (search_type == 'post') {
			var source = document.getElementById('post_source') || document.getElementById('upload_source');
			var match = null;
			if (source) match = source.value.match(/(?:.*:\/\/)?(.*?)\/(.*)/);
			// Domain name except top level, and path name except file name.
			if (match)
				return ['__ALL__'].concat(match[1].split('.').slice(0,-1), match[2].split('/').slice(0,-1));
			else
				return ['__ALL__', '__POST__'];
		} else if (search_type == 'update') {
			var context = ['__ALL__', '__UPDATE__'];
			// Grab first artist and copyright, if available.
			var tags = document.getElementById('tag-sidebar') || document.getElementById('tag-list');
			if (!tags) return context;
			var artist = tags.querySelector('.tag-type-artist > a:last-of-type') ||
				tags.querySelector('.category-1 .search-tag');
			var copy = tags.querySelector('.tag-type-copyright > a:last-of-type') ||
				tags.querySelector('.category-3 .search-tag');
			if (artist)
				context.push(artist.textContent.replace(' ', '_'));
			if (copy)
				context.push(copy.textContent.replace(' ', '_'));
			return context;
		} else {
			return ['__ALL__', '__SEARCH__'];
		}
	},

	// Called on window event, the result has been written to window.danbooruUpCompleterResult.
	returnResult: function()
	{
		var result = window.danbooruUpCompleterResult;
		this.cur_callback(result[0], result[1]);
	},

	getRelated: function(tag, callback)
	{
		this.cur_callback = callback;
		this.sendRequest({"tag" : tag}, 'related');
	},

	onSubmit: function(search_type, tags)
	{
		if (search_type == 'update') {
			var old_tags = {};
			var old_tag_el = document.getElementById('post_old_tags') || document.getElementById('post_old_tag_string');
			if (old_tag_el)
				old_tag_el.value.split(' ').forEach(function(tn) { old_tags[tn] = true; });
			tags = tags.filter(function(tag) !(tag[0] in old_tags));
		}
		tags = tags.map(function(t) { return [t[0].toLowerCase(), t[1].toLowerCase()]; });
		var context = this.getContext(search_type);
		var query = {"tags": tags, "ctx": context};

		this.sendRequest(query, 'update');
	},

	sendRequest: function(query, command)
	{
		var element = document.createElement('DUSearch');
		element.setAttribute('command', command);
		element.setAttribute('query', JSON.stringify(query));
		document.documentElement.appendChild(element);

		var evt = document.createEvent("Events");
		evt.initEvent('DanbooruUpSearchEvent', true, false);
		element.dispatchEvent(evt);

		document.documentElement.removeChild(element);
	},

	openBrowserTab: function(tag)
	{
		// This is never called, browsers don't support middle/right click on list boxes.
	},

	prefCompleteWithTab: function()
	{
		return danbooruUpACPrefs.completeWithTab;
	},

	prefSuggestPrefixes: function()
	{
		return danbooruUpACPrefs.suggestPrefixes;
	}
};

window.danbooruUpCompleter = danbooruUpCompleter;
window.addEventListener('DanbooruUpSearchResultEvent', function(e) { danbooruUpCompleter.returnResult() }, false);
