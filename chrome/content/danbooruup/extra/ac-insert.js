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
}catch(e){GM_log("danbooruUp: while inserting styles: "+e);}

function doAutocompleteInsertion()
{

// the custom selector function for the Autocompleter
function tagSelector(instance) {
	var ret = [];
	var entry	= instance.getToken();
	var tags = [];
	var result;

	entry = entry.replace(/\\/g, '\\\\');
	entry = entry.replace(/_/g, '\\_');
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

	result = danbooruUpSearchTags(entry, instance.options.choices);

	if (!tags || !result.getMatchCount()) return '<ul></ul>';

	var count = Math.min(instance.options.choices, result.getMatchCount());

	// div is for html escaping tag names
	var div = document.createElement("div");
	var text = document.createTextNode('');
	div.appendChild(text);
	for(var i=0; i<count; i++) {
		text.textContent = result.getValueAt(i);
		tags.push("<li><span class=\""+ result.getStyleAt(i) + "\">" + div.innerHTML + "</span></li>");
	}
	delete result;

	return "<ul>" + tags.join('') + "</ul>";
}

// get the pixel height of an A element, to size things in multiples of lines
try {
	var anode = document.createElement('a');
	anode.style.visibility = 'hidden';
	anode.style.position = 'absolute';
	anode.innerHTML = 'Test';
	document.body.appendChild(anode);
	var lineHeight = anode.offsetHeight;
	document.body.removeChild(anode);
} catch(e) { lineHeight = 16; }

// create the CSS
var cssdec = ".danbooruup-ac { border: 1px solid black; overflow: auto; background: #fff; min-height: "+lineHeight+"px; z-index: 1000 !important; }\n" +
		".danbooruup-ac > ul { min-width: inherit; }\n" +
		".danbooruup-ac > ul > li { display: block; text-align: left; background: #fff; margin: 0; padding: 0; padding-left: 4px; padding-right: 4px;}\n" +
		".danbooruup-ac > ul > li.selected { background: #ffc; }\n";

// tag style rules
for (rule in style_arr) {
	cssdec += ".danbooruup-ac > ul > li"+ (rule.match(/\.selected$/) || '') +" > span.danbooru-tag-type-" + rule.match(/[^.]+/) + " { " + style_arr[rule] + " }\n";
}

// add the CSS
var style = document.createElement("style");

style.innerHTML = cssdec;

document.getElementsByTagName("head")[0].appendChild(style);

// creates and hooks the actual Autocompleter object
function createAC(elementID, options)
{
	try{
	var foptions = {tokens:[' ','　',','], choices:150, selector:tagSelector};
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
		try {
		document.body.appendChild(div);
		} catch(eex) { GM_log("danbooruUp: while appending div for " + elementID + ":\n"+eex); throw eex;}

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
// for post/(list|index) and the static index
createAC("tags", {isSearchField: true});

// for post/(view|show) and post/(add|upload)
if(document.location.href.match(/\/post\/(view|show|add|upload)(\/|$)/))
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
	createAC("tag");
}
else if(document.location.href.match(/\/tag\/edit(\/|$)/))
{
	createAC("tag_name");
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
	createAC("name");
	createAC("alias");
}
else if(document.location.href.match(/\/tag_alias\/add(\/|$)/))
{
	createAC("tag_alias_name");
	createAC("tag_alias_alias");
}
// for implications
else if(document.location.href.match(/\/tag\/implications(\/|$)/))
{
	createAC("child");
	createAC("parent");
}
else if(document.location.href.match(/\/tag_implication\/add(\/|$)/))
{
	createAC("tag_implication_predicate");
	createAC("tag_implication_consequent");
}
// user settings
else if(document.location.href.match(/\/user\/edit(\/|$)/))
{
	createAC("user_tag_blacklist");
	createAC("user_my_tags");
}

} // doAutocompleteInsertion

// firefox 3 trunk builds seem to have some issue with scripts being delayed somewhat, so we need to wait until the autocompleter
// code is actually present in the target page before trying to add any

var tries = 0;
function attemptAutocompleteInsertion()
{
	if(typeof unsafeWindow.Autocompleter == 'object') {
		doAutocompleteInsertion();
	} else {
		if(tries++ == MAX_TRIES) {
			GM_log("danbooruUpHelper: failed to insert code after " + MAX_TRIES + " tries (" + MAX_TRIES*RETRY_INTERVAL + " ms)");
			return;
		}
		GM_log("danbooruUpHelper: inserting code: retry #" + tries);
		setTimeout(attemptAutocompleteInsertion, RETRY_INTERVAL);
	}
}
setTimeout(attemptAutocompleteInsertion, RETRY_INTERVAL);

