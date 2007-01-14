function init()
{
	var prefSvc = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	var ml = document.getElementById('danbooru');
	ml.selectedIndex = -1;
	ml.removeAllItems();
	gDanbooruManager.init(ml);

	document.getElementById('tags').focus();

	if (prefSvc.getBoolPref("extensions.danbooruUp.fileurlsource") || !(window.arguments[0].imageURI.scheme == 'file') )
	{
		document.getElementById('source').value = window.arguments[0].imageURI.spec;
	}
}

function doOK()
{
	var ml = document.getElementById('danbooru');
	var tags = document.getElementById('tags').value;
	var rating = ['Explicit','Questionable','Safe'][document.getElementById('ratinggrp').selectedIndex];
	gDanbooruManager.selectDanbooru(ml.selectedIndex);
	gDanbooruManager.uninit();

	if(tags.length) {
		// compact tag input
		var tagarr=tags.replace(/\s\s+/g, ' ').replace(/^\s+|\s+$/g,'').split(' ');
		var flat=[];
		var needupdate = false;
		for(var a in tagarr) {
			flat[tagarr[a]]=null;
		}
		try { 		
			var taghist = Components.classes["@unbuffered.info/danbooru/taghistory-service;1"]
					.getService(Components.interfaces.nsIDanbooruTagHistoryService);
			for(var a in flat) {
				if (!taghist.incrementValueForName(a))
					needupdate = true;
			}
		} catch(e) {
			// silently fail
		}
		var prefService		= Components.classes["@mozilla.org/preferences-service;1"]
					.getService(Components.interfaces.nsIPrefBranch);
		needupdate = prefService.getBoolPref("extensions.danbooruUp.autocomplete.update.afterdialog") && needupdate;
	}

	window.arguments[0].start(
		window.arguments[0].imageURI,
		document.getElementById('source').value,
		tags,
		rating,
		ml.label,
		window.arguments[0].imageLocation,
		window.arguments[0].wind,
		needupdate);
	window.arguments[0].imageLocation = null;
	window.arguments[0].wind = null;
	window.arguments=null;

	return true;
}
function doCancel() {
	return true;
}

