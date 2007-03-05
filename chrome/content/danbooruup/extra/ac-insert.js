// insert our prototype and scriptaculous scripts into the page
// vim:set encoding=utf-8:

const RETRY_INTERVAL = 100;
const MAX_TRIES = 5;

try {
for(var i=0; i < script_arr.length; i++)
{
	var s = document.createElement("script");
	s.setAttribute("type","text/javascript");
	s.appendChild(document.createTextNode(
				"//<![CDATA[\n" +
				script_arr[i]
				+ "\n//]]>"
				)
			);
	document.getElementsByTagName("head")[0].appendChild(s);
}
}catch(e){GM_log(e);}

function doAutocompleteInsertion()
{

// the custom selector function for the Autocompleter
function tagSelector(instance) {
	var ret = [];
	var entry	= instance.getToken();
	var tags = [];
	var result;

	if (entry.indexOf('*') == -1)
		entry += '%';
	else
		entry = entry.replace(/\*/g, '%');

	if (instance.options.isSearchField &&
		(entry[0] == '-' || entry[0] == '~')
		)
	{
		entry = entry.substr(1);
	}

	result = danbooruUpSearchTags(entry);

	if (!tags || !result.getMatchCount()) return '<ul></ul>';

	//tags = tags.slice(0, instance.options.choices);
	var count = Math.min(instance.options.choices, result.getMatchCount());

	// div is for html escaping tag names
	var div = document.createElement("div");
	var text = document.createTextNode('');
	div.appendChild(text);
	for(var i=0; i<count; i++) {
		text.textContent = result.getValueAt(i);
		tags.push("<li class=\""+ result.getStyleAt(i) + "\">" + div.innerHTML + "</li>");
	}
	delete result;

	return "<ul>" + tags.join('') + "</ul>";
}

// get the pixel height of the A element after the big danbooru link, to size things in multiples of lines
try {
var lineHeight = document.getElementsByTagName("a")[1].offsetHeight;
} catch(e) { lineHeight = 16; }

// add the CSS
var style = document.createElement("style");
style.innerHTML = ".danbooruup-ac { border: 1px solid black; overflow: auto; background: #fff; min-height: "+lineHeight+"px; z-index: 1000 !important; }\n" +
		".danbooruup-ac ul { min-width: inherit; }\n" +
		".danbooruup-ac li { display: block; text-align: left; background: #fff; margin: 0; padding: 0; padding-left: 4px; padding-right: 4px;}\n" +
		".danbooruup-ac li.selected { background: #ffc; }";
document.getElementsByTagName("head")[0].appendChild(style);

// creates and hooks the actual Autocompleter object
function createAC(elementID, options)
{
	try{
	var foptions = {tokens:[' ','　'], choices:150, selector:tagSelector};
	var ac = null;

	options = options || {};
	for (var p in options) {
		foptions[p] = options[p];
	}
	} catch(ee) { GM_log("danbooruUp: HOW " + elementID + ":\n"+ee); }

	try {
	if(document.getElementById(elementID))
	{
		// create the div
		var div = document.createElement("div");
		var divid = "danbooruup-" + elementID + "-autocomplete";
		try {
		div.setAttribute("id", divid);
		} catch(eex) { GM_log("danbooruUp: while setting id for " + elementID + ":\n"+eex);  throw eex;}
		try {
		div.setAttribute("class","danbooruup-ac");
		} catch(eex) { GM_log("danbooruUp: while setting class for " + elementID + ":\n"+eex);  throw eex;}
		try {
		div.style.display = 'none';
		} catch(eex) { GM_log("danbooruUp: while setting style for " + elementID + ":\n"+eex); throw eex;}
		document.body.appendChild(div);

		// create the autocompleter
		try {
		//ac = new Autocompleter_DanbooruUp(elementID, divid, [], foptions);
		ac = unsafeWindow.createACDU(elementID, divid, foptions);
		} catch(eex) { GM_log("danbooruUp: while creating AC for " + elementID + ":\n"+eex);  throw eex;}
	}
	return ac;
	} catch(ee) { GM_log("danbooruUp: while inserting for " + elementID + ":\n"+ee); }
}

// create the autocomplete popups
// for post/list and the main index
createAC("tags", {isSearchField: true});

// for post/view and post/add
if(document.location.href.match(/\/post\/(view|add)(\/|$)/))
{
	createAC("post_tags");
}
// for rename
else if(document.location.href.match(/\/tag\/rename(\/|$)/))
{
	createAC("name", {isSearchField: true});
}
// for set_type
else if(document.location.href.match(/\/tag\/set_type(\/|$)/))
{
	createAC("tag", {isSearchField: true});
}
// for mass_edit
else if(document.location.href.match(/\/tag\/mass_edit(\/|$)/))
{
	createAC("start", {isSearchField: true});
	createAC("result");
}
// for alias
else if(document.location.href.match(/\/tag\/aliases(\/|$)/))
{
	createAC("name", {isSearchField: true});
	createAC("alias", {isSearchField: true});
}
// for implications
else if(document.location.href.match(/\/tag\/implications(\/|$)/))
{
	createAC("child", {isSearchField: true});
	createAC("parent", {isSearchField: true});
}

} // doAutocompleteInsertion

// firefox 3 trunk builds seem to have some issue with scripts being delayed somewhat, so we need to wait until the autocompleter
// code is actually present in the target page before trying to add any

var tries = 0;
function attemptAutocompleteInsertion()
{
	if(typeof unsafeWindow.Autocompleter == 'object')
	{
		doAutocompleteInsertion();
	} else {
		if(tries++ == MAX_TRIES) {
			GM_log("danbooruUpHelper: failed to insert code after " + MAX_TRIES + " tries (" + MAX_TRIES*RETRY_INTERVAL + " ms)");
			return;
		}
		GM_log("danbooruUpHelper: retry " + tries);
		setTimeout(attemptAutocompleteInsertion, RETRY_INTERVAL);
	}
}
setTimeout(attemptAutocompleteInsertion, RETRY_INTERVAL);

