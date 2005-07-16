// This is a list of ids to elements of the following type: radiogroup, textbox, 
// checkbox, menulist that can be prefilled automatically from preferences (default
// or user) by the Options dialog's framework. To benefit from this prefilling each
// checkbox etc that you use should be annotated with the pref identifier that 
// it is tied to, the type of pref, and a unique id, which is added to this array.
//
// e.g for this XUL element:
//
// <checkbox id="showSampleWindow" label="Show Sample Window"
//           preftype="bool" prefstring="sample.options.showSampleWindow"/>
//
// _elementIDs would look like this:
//
// var _elementIDs = ["showSampleWindow"];
//
var _elementIDs = [];

// This function is called before the dialog is shown, and before the preferences
// auto-filling code has initialized the state of any of the UI elements in this
// dialog. Thus it is not possible to do enabling or disabling at this point since
// you won't correctly know the state of your UI.
function onLoad()
{
  // We ask the parent dialog (which is the Firebird Options dialog) to initialize
  // this by using the preferences auto-prefill code.
  dump('dupo load');
  window.opener.top.initPanel(window.location.href, window);  
}

// This is a special function that is called by the preferences auto-prefilling code
// AFTER all of the UI elements defined in _elementIDs above have been prefilled from
// the user or default preferences. You can execute code in this method that enables
// or disables elements based on the state of various UI elements, since their state
// has already been established. 
function Startup()
{
  // Enabling code can execute here. 
  dump('dupo start');
}

// The user pressed the OK button on the dialog. 
function onOK()
{
  // Tell the preferences framework to save the user's modifications for this 
  // panel, but don't actually save them to disk until the user presses "OK" in
  // the master Options dialog. 
  dump('dupo ok');
  window.opener.top.hPrefWindow.wsm.savePageData(window.location.href, window);

  // Dialog OK handlers must return true. 
  return true;
}

// Any specialized enabling code and code for other UI controls in the options dialog
// goes here. 

