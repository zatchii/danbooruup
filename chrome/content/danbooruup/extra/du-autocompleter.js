// Adds page up/down and tweaks sizing
// also gets rid of scrollIntoView(true), which doesn't work so hot in Gecko, the only platform we have to worry about
// vim:set ts=2 sw=2 et:
Autocompleter.DanbooruUp = Class.create();
Autocompleter.DanbooruUp.prototype = Object.extend(new Autocompleter.Base(), {
  initialize: function(element, update, array, options) {
    // tokens array needs prototype stuff added to it
    var newtokens = new Array;
    for(var i=0; i<options.tokens.length; i++) {
      newtokens.push(options.tokens[i]);
    }
    options.tokens = newtokens;
    this.baseInitialize(element, update, options);
    this.index = -1;
    this.options.array = array;
  },

  updateChoices: function(choices) {
    if(!this.changed && this.hasFocus) {
      this.update.innerHTML = choices;
      Element.cleanWhitespace(this.update);
      Element.cleanWhitespace(this.update.down());

      if(this.update.firstChild && this.update.down().childNodes) {
        this.entryCount =
          this.update.down().childNodes.length;
        for (var i = 0; i < this.entryCount; i++) {
          var entry = this.getEntry(i);
          entry.autocompleteIndex = i;
          this.addObservers(entry);
        }
      } else {
        this.entryCount = 0;
      }

      this.stopIndicator();
      this.index = -1;

      if(this.entryCount==1 && this.options.autoSelect) {
        this.selectEntry();
        this.hide();
      } else {
        this.render();
      }
    }
  },

  getUpdatedChoices: function() {
    this.updateChoices(this.options.selector(this));
  },

  onKeyPress: function(event) {
    if(this.active)
      switch(event.keyCode) {
        case Event.KEY_TAB:
        case Event.KEY_RETURN:
          this.selectEntry();
          Event.stop(event);
        case Event.KEY_ESC:
          this.hide();
          this.active = false;
          Event.stop(event);
          return;
        case Event.KEY_LEFT:
        case Event.KEY_RIGHT:
          this.selectEntry();
          this.hide();
          return;
        case Event.KEY_PAGEUP:
          this.markPreviousPage();
          this.render();
          Event.stop(event);
          return;
        case Event.KEY_PAGEDOWN:
          this.markNextPage();
          this.render();
          Event.stop(event);
          return;
        case Event.KEY_UP:
          this.markPrevious();
          this.render();
          /*if(Prototype.Browser.WebKit)*/ Event.stop(event);
          return;
        case Event.KEY_DOWN:
          this.markNext();
          this.render();
          /*if(Prototype.Browser.WebKit)*/ Event.stop(event);
          return;
      }
    else
      if(event.keyCode==Event.KEY_TAB || event.keyCode==Event.KEY_RETURN ||
          (Prototype.Browser.WebKit > 0 && event.keyCode == 0)) return;

    switch(event.keyCode) {
      case Event.KEY_ESC:
      case Event.KEY_LEFT:
      case Event.KEY_RIGHT:
        return;
    }

    this.changed = true;
    this.hasFocus = true;

    if(this.observer) clearTimeout(this.observer);
    this.observer =
      setTimeout(this.onObserverEvent.bind(this), this.options.frequency*1000);

    switch(event.keyCode) {
      case Event.KEY_UP:
      case Event.KEY_DOWN:
        Event.stop(event);
        return;
    }
  },

  render: function() {
    if(this.entryCount > 0) {
      var lineHeight = this.update.firstChild.childNodes[0].clientHeight;
      if (!lineHeight)
      {
        try {
          var anode = document.createElement('a');
          anode.style.visibility = 'hidden';
          anode.style.position = 'absolute';
          anode.innerHTML = 'Test';
          document.body.appendChild(anode);
          var lineHeight = anode.offsetHeight;
        	document.body.removeChild(anode);
        } catch(e) { lineHeight = 16; }
      }
      var step = Math.ceil(this.update.clientHeight/lineHeight);
      var topDisplayed = Math.ceil(this.update.scrollTop / lineHeight);
      var bottomDisplayed = Math.floor((this.update.scrollTop + this.update.clientHeight) / lineHeight) - 1;
      var min = topDisplayed - 1;
      var max = bottomDisplayed + 1;
      if (min < 0) min = 0;
      if (max >= this.entryCount) max = this.entryCount;
      for (var i = min; i < max; i++)
        this.index==i ?
          Element.addClassName(this.getEntry(i),"selected") :
          Element.removeClassName(this.getEntry(i),"selected");
      if(this.hasFocus) {
        this.show();
        this.active = true;
      }
    } else {
      this.active = false;
      this.hide();
    }
  },

  markPrevious: function() {
    if(this.index >= 0) this.index--
      else this.index = this.entryCount-1;
    this.getEntry(this.index).scrollIntoView(false);
  },
  markNext: function() {
    if(this.index < this.entryCount-1) this.index++
      else this.index = -1;
    this.getEntry(this.index).scrollIntoView(false);
  },
  markPreviousPage: function() {
    var lineHeight = this.update.firstChild.childNodes[0].clientHeight;
    var step = Math.ceil(this.update.clientHeight/lineHeight);
    var topDisplayed = Math.ceil(this.update.scrollTop / lineHeight);

    if(this.index == 0) { this.index = -1; }
    else if(this.index == -1) { this.index = this.entryCount-1; }
    else {
      if(this.index == topDisplayed) { // at top
        this.index -= step;
        if (this.index < 0) this.index = 0;
      } else {
        this.index = topDisplayed;
      }
    }
    this.getEntry(this.index).scrollIntoView(false);
  },
  markNextPage: function() {
    var lineHeight = this.update.firstChild.childNodes[0].clientHeight;
    var step = Math.ceil(this.update.clientHeight/lineHeight);
    var bottomDisplayed = Math.floor((this.update.scrollTop + this.update.clientHeight) / lineHeight) - 1;

    if(this.index == this.entryCount-1) { this.index = -1; }
    else if(this.index == -1) { this.index = 0; }
    else {
      if(this.index == bottomDisplayed) { // at bottom
        this.index += step;
        if (this.index > this.entryCount-1) this.index = this.entryCount-1;
      } else {
        this.index = bottomDisplayed;
      }
    }
    this.getEntry(this.index).scrollIntoView(false);
  },

  getEntry: function(index) {
    return this.update.firstChild.childNodes[(index == -1) ? 0 : index];
  },

  selectEntry: function() {
    this.active = false;
    if(this.index != -1)
      this.updateElement(this.getCurrentEntry());
  },

  updateElement: function(selectedElement) {
    if (this.options.updateElement) {
      this.options.updateElement(selectedElement);
      return;
    }
    var value = '';
    if (this.options.select) {
      var nodes = document.getElementsByClassName(this.options.select, selectedElement) || [];
      if(nodes.length>0) value = Element.collectTextNodes(nodes[0], this.options.select);
    } else
      value = Element.collectTextNodesIgnoreClass(selectedElement, 'informal');

    this.replaceCurrentWord(value);
    this.oldElementValue = this.element.value;
    this.element.focus();

    if (this.options.afterUpdateElement)
      this.options.afterUpdateElement(this.element, selectedElement);
  },

  getToken: function() {
    var p=this.element.selectionStart;
    var fr=this.element.value.substr(0,p);
    var front = -1;
    for (var i=0; i<this.options.tokens.length; i++) {
      var thisTokenPos = fr.lastIndexOf(this.options.tokens[i]);
      if (thisTokenPos > front)
        front = thisTokenPos;
    }
    var ba=this.element.value.substr(p);
    var back = ba.length;
    for (var i=0; i<this.options.tokens.length; i++) {
      var thisTokenPos = ba.indexOf(this.options.tokens[i]);
      if (thisTokenPos > -1 && thisTokenPos < back)
        back = thisTokenPos;
    }

    return this.element.value.substr(1+front,p-front+back-1)
  },
  replaceCurrentWord: function(aVal) {
    var p=this.element.selectionStart;
    var fr=this.element.value.substr(0,p);
    var front = -1;
    for (var i=0; i<this.options.tokens.length; i++) {
      var thisTokenPos = fr.lastIndexOf(this.options.tokens[i]);
      if (thisTokenPos > front)
        front = thisTokenPos;
    }

    var ba=this.element.value.substr(p);
    var back=ba.length;
    for (var i=0; i<this.options.tokens.length; i++) {
      var thisTokenPos = ba.indexOf(this.options.tokens[i]);
      if (thisTokenPos > -1 && thisTokenPos < back)
        back = thisTokenPos;
    }

    // negations and such
    if(this.element.value.substr(1+front,1).match(/[-~]/))
      front++;

    this.element.value = (this.element.value.substr(0,1+front) + aVal + ba.substr(back));
    this.element.selectionStart = this.element.selectionEnd = (front==-1 ? 0 : front) + aVal.length;
  },

  setOptions: function(options) {
    this.options = Object.extend({
      choices: 50,
      selector: function(instance) {
        // stub; always replaced by the tagSelect function in the sandbox
        return '';
      },
      onShow: function(element, update) {
        if(!update.style.position || update.style.position=='absolute') {
          update.style.position = 'absolute';
          // long tag names mean we can't explicitly set the width using Position
          Position.clone(element, update, {
            setHeight: false, setWidth: false,
            offsetTop: element.offsetHeight
            });
          // set minWidth like with the normal AutoCompletePopup
          update.style.minWidth = element.offsetWidth+2+'px';
          // A's are as tall as LI's with the current style
          try {
          var lineHeight = document.getElementsByTagName("a")[1].offsetHeight;
          } catch(e) {lineHeight = 16;}

          // post/view has a dynamic length, so we need to recalculate it
          if(element.id == 'post_tags' && $("edit")) {
            // post/view area
            // minus the image and post bar, and the header
            // minus the space between the top of the edit div and the bottom of the post_tags input
            var height = $("edit").parentNode.clientHeight -
              ($("edit").offsetTop - $("edit").parentNode.offsetTop) -
              ($("post_tags").offsetTop - $("edit").offsetTop + $("post_tags").offsetHeight);
            // trim and min/max
            height -= height % lineHeight;
            if (height > lineHeight*20) height = lineHeight*20;
            else if (height < lineHeight) height = lineHeight;
            update.style.maxHeight = height+"px";
          } else {
            update.style.maxHeight = (lineHeight*20) + "px";
          }
          Effect.Appear(update,{duration:0.15});
        }
      },
    }, options || {});
  }
});

// need this since the XPCSafeJSObjectWrapper prevents creating a new Autocompleter.DanbooruUp from the sandbox
function createACDU(element, div, options)
{
	return new Autocompleter.DanbooruUp(element, div, [], options);
}

