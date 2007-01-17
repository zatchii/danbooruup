// Adds page up/down and tweaks sizing
// also gets rid of scrollIntoView(true), which doesn't work so hot in Gecko, the only platform we have to worry about
Autocompleter.DanbooruUp = Class.create();
Autocompleter.DanbooruUp.prototype = Object.extend(new Autocompleter.Base(), {
  initialize: function(element, update, array, options) {
    this.baseInitialize(element, update, options);
    this.options.array = array;
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
          this.active = false;
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
          /*if(navigator.appVersion.indexOf('AppleWebKit')>0)*/ Event.stop(event);
          return;
        case Event.KEY_DOWN:
          this.markNext();
          this.render();
          /*if(navigator.appVersion.indexOf('AppleWebKit')>0)*/ Event.stop(event);
          return;
      }
    else
      if(event.keyCode==Event.KEY_TAB || event.keyCode==Event.KEY_RETURN ||
          (navigator.appVersion.indexOf('AppleWebKit') > 0 && event.keyCode == 0)) return;

    this.changed = true;
    this.hasFocus = true;

    if(this.observer) clearTimeout(this.observer);
    this.observer =
      setTimeout(this.onObserverEvent.bind(this), this.options.frequency*1000);
  },
  markPrevious: function() {
    if(this.index > 0) this.index--
      else this.index = this.entryCount-1;
    this.getEntry(this.index).scrollIntoView(false);
  },
  markPreviousPage: function() {
    var lineHeight = this.update.firstChild.childNodes[0].clientHeight;
    var step = Math.ceil(this.update.clientHeight/lineHeight);
    var topDisplayed = Math.ceil(this.update.scrollTop / lineHeight);

    if(this.index == 0) { this.index = this.entryCount-1; }
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

    if(this.index == this.entryCount-1) { this.index = 0; }
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

    var lastTokenPos = this.findLastToken();
    if (lastTokenPos != -1) {
      // negation
      if (this.options.isSearchField && this.element.value[lastTokenPos + 1] == '-') lastTokenPos++;
      var newValue = this.element.value.substr(0, lastTokenPos + 1);
      var whitespace = this.element.value.substr(lastTokenPos + 1).match(/^\s+/);

      if (whitespace)
        newValue += whitespace[0];
      this.element.value = newValue + value;
    } else {
      this.element.value = value;
    }
    this.element.focus();

    if (this.options.afterUpdateElement)
      this.options.afterUpdateElement(this.element, selectedElement);
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
