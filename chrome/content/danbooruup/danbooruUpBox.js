function init()
{
	document.getElementById('source').value = window.arguments[0].imageURI.spec;
	var ml = document.getElementById('danbooru');
	ml.selectedIndex = -1;
	ml.removeAllItems();
	gDanbooruManager.init(ml);
	document.getElementById('tags').focus();
}

function doOK()
{
	var ml = document.getElementById('danbooru');
	var tags = document.getElementById('tags').value;
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
			var taghist = Components.classes["@mozilla.org/danbooru/taghistory-service;1"]
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
		document.getElementById('title').value,
		ml.label,
		window.arguments[0].imageNode,
		window.arguments[0].wind,
		needupdate);
	window.arguments[0].imageNode = null;
	window.arguments[0].wind = null;
	window.arguments=null;

	return true;
}
function doCancel() {
	return true;
}

