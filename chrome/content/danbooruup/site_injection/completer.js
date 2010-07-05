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
		var query = [tag, 'P', prefix, ' ' , this.getContextStr()].join('');

		this.sendRequest(query, 'search');
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
			var artist;
			var copy;
			if (tags.querySelector) {
				artist = tags.querySelector('.tag-type-artist > a:last-of-type');
				copy = tags.querySelector('.tag-type-copyright > a:last-of-type');
			}
			if (artist)
				context.push(artist.textContent.replace(' ', '_'));
			if (copy)
				context.push(copy.textContent.replace(' ', '_'));
			return context;
		} else {
			return ['__ALL__', '__SEARCH__'];
		}
	},

	getContextStr: function(search_type)
	{
		return this.getContext(search_type).join(',').replace(' ', '');
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
		this.sendRequest(tag, 'related');
	},

	onSubmit: function(search_type, tags)
	{
		// TODO: Switch to JSON if dropping support for < 3.5
		if (search_type == 'update') {
			var old_tags = {};
			document.getElementById('post_old_tags').value.split(' ').forEach(function(tn) { old_tags[tn] = true; });
			tags = tags.filter(function(tag) !(tag[0] in old_tags));
		}
		var tagstr = tags.map(function(t) t[0].toLowerCase() + 'P' + t[1].toLowerCase()).join('X');
		var context = this.getContextStr();
		var query = [tagstr, this.getContextStr()].join(' ');

		this.sendRequest(query, 'update');
		return false;
	},

	sendRequest: function(tag, command)
	{
		var element = document.createElement('DUSearch');
		element.setAttribute('command', command);
		element.setAttribute('query', tag);
		document.documentElement.appendChild(element);

		var evt = document.createEvent("Events");
		evt.initEvent('DanbooruUpSearchEvent', true, false);
		element.dispatchEvent(evt);

		document.documentElement.removeChild(element);
	},

	openBrowserTab: function(tag)
	{
		// This is never called, browsers don't support middle/right click on list boxes.
	}
};

window.danbooruUpCompleter = danbooruUpCompleter;
window.addEventListener('DanbooruUpSearchResultEvent', function(e) { danbooruUpCompleter.returnResult() }, false);
