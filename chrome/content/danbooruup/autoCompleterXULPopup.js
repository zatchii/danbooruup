// Makes the autocompleter work in XUL

var danbooruACXULPopup = function(textfield) {
	this.textfield = textfield;

	this.popup = document.createElement('panel');
	this.popup.setAttribute('class', 'danbooru-autocomplete');
	this.popup.setAttribute('noautofocus', 'true');

	this.listbox = document.createElement('richlistbox');
	this.popup.appendChild(this.listbox);

	this.textfield.parentNode.appendChild(this.popup);

	this.timer = Components.classes['@mozilla.org/timer;1'].createInstance(Components.interfaces.nsITimer);
};

danbooruACXULPopup.prototype = {
	get state() {
		return this.popup.state;
	},

	openPopup: function()
	{
		this.timer.cancel();
		this.popup.openPopup(this.textfield, 'after_start', 0, 0, false, false);
	},

	hidePopup: function()
	{
		// Avoid errors when closing dialog
		if (this.popup && this.popup.hidePopup)
			this.popup.hidePopup();
	},

	// Hide after a certain time if cancelHide or openPopup isn't called by then.
	timedHide: function()
	{
		this.timer.initWithCallback(this, 200, this.timer.TYPE_ONE_SHOT);
	},

	cancelHide: function()
	{
		this.timer.cancel();
	},

	notify: function()
	{
		this.hidePopup();
	},

	getIndent: function(position)
	{
		return /^\s*/.exec(this.listbox.getItemAtIndex(position).label)[0];
	},

	isClick: function(event)
	{
		var source = event.originalTarget;
		while (source && source.localName != 'richlistitem') {
			source = source.parentNode;
		}
		return source;
	},

	insertTags: function(tags, indent, search, tagclasses, position)
	{
		var tc = tagclasses;
		var frag = document.createDocumentFragment();
		var searchRes = -1;
		for (var i = 0; i < tags.length; i++) {
				let x = tags[i];
				let li = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'richlistitem');
				li.value = x[0];
				li.setAttribute('class', tc[x[1]] + (x[2] ? ' ' + tc[2] : ''));
				li.label = indent ? indent + x[0] : x[0];
				let label = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'description');
				label.appendChild(document.createTextNode(li.label));
				li.appendChild(label);
				frag.appendChild(li);
				if (search === x[0] && searchRes === -1)
					searchRes = i;
		}

		var lb = this.listbox;

		if (position == -1) {
			while (lb.hasChildNodes())
				lb.removeChild(lb.firstChild);
		}

		lb.insertBefore(frag, lb.getItemAtIndex(position + 1));

		return searchRes;
	},

	// Scroll the textfield to the cursor position.
	scrollText: function(textfield)
	{
		// Send a left-right keypress sequence.
		var evt = document.createEvent("KeyboardEvent");
		evt.initKeyEvent('keypress', true, false, window, false, false, false, false, KeyEvent.DOM_VK_LEFT, 0);
		textfield.inputField.dispatchEvent(evt);
		evt = document.createEvent("KeyboardEvent");
		evt.initKeyEvent('keypress', false, false, window, false, false, false, false, KeyEvent.DOM_VK_RIGHT, 0);
		textfield.inputField.dispatchEvent(evt);
	}
};
