// Makes the autocompleter work in HTML

var danbooruACHTMLPopup = function(textfield) {
	this.div = document.createElement('div');
	this.div.setAttribute("class", "danbooru-autocomplete");
	this.listbox = document.createElement('select');
	this.div.appendChild(this.listbox);
	textfield.parentNode.insertBefore(this.div, textfield.nextSibling);

	if (textfield.tagName == 'TEXTAREA') {
		this.tag_prefix = this.post_tag_prefix;
		this.other_prefix = this.post_other_prefix;
	} else {
		this.tag_prefix = this.search_tag_prefix;
		this.other_prefix = this.search_other_prefix;
	}

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
	search_tag_prefix: /^[-~]/,
	search_other_prefix: /^(:?user|fav|md5|-?rating|source|id|width|height|score|mpixels|date|status|order|parent|unlocked|sub|pool):/i,

	post_tag_prefix: /^(?:(?:general|artist|char(?:acter)?|copy(?:right)?|amb(?:iguous)?):)+/i,
	post_other_prefix: /^(?:rating|parent|-?pool):/i,

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
		var source = event.originalTarget;
		while (source && source.localName != 'OPTION') {
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
				let x = tags[i];
				let li = document.createElement('option');
				li.value = x[0];
				li.setAttribute('class', tc[x[1]] + (x[2] ? tc[2] : ''));
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
		// Send a escape keypress.
		evt = document.createEvent("KeyboardEvent");
		evt.initKeyEvent('keypress', false, false, window, false, false, false, false, KeyEvent.DOM_VK_ESCAPE, 0);
		textfield.dispatchEvent(evt);
	}
};
