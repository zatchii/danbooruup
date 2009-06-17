var danbooruUpCompleter = {
	result: null,
	cur_tag: '',
	cur_callback: null,
	timer: null,

	getSuggestions: function(tag, callback)
	{
		this.cur_callback = callback;
		this.cur_tag = tag;
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

		var element = document.createElement('DUSearch');
		element.setAttribute('command', 'search');
		element.setAttribute('query', this.cur_tag);
		document.documentElement.appendChild(element);

		var evt = document.createEvent("Events");
		evt.initEvent('DanbooruUpSearchEvent', true, false);
		element.dispatchEvent(evt);

		document.documentElement.removeChild(element);
	},

	// Called on window event, the result has been written to window.danbooruUpCompleterResult.
	returnResult: function()
	{
		var result = window.danbooruUpCompleterResult;
		this.cur_callback(result[0], result[1]);
	},

	getRelated: function(tag, callback)
	{
		// Will only work if the booru is running from the top level.
		var uri = document.location.protocol + '//' + document.location.host + '/tag/related.xml';
		uri += '?tags=' + encodeURIComponent(tag);

		var request = new XMLHttpRequest();
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
						tags.push([node.getAttribute('name'), 0, 0]);	// Just push them on without type info...
					}

					callback(tag, tags);
				} else {
					__log('Got status ' + this.status + ' from artist search.');
				}
			},
			false
		);
		request.send(null);
	},

	openBrowserTab: function(tag)
	{
		alert('Hey!');
		/*
		var ioService = Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
		var br = wm.getMostRecentWindow("navigator:browser");

		var boardUri = document.getElementById('danbooru').label;
		var uri = ioService.newURI(boardUri, null, null).QueryInterface(Components.interfaces.nsIURL);
		uri.path = uri.path.replace(/\/[^/]+\/[^/]+$/, "/post/index");

		uri.query = "tags=" + encodeURIComponent(tag);

		br.getBrowser().selectedTab = br.getBrowser().addTab(uri.spec);
		*/
	}
};

window.danbooruUpCompleter = danbooruUpCompleter;
window.addEventListener('DanbooruUpSearchResultEvent', function(e) { danbooruUpCompleter.returnResult() }, false);
