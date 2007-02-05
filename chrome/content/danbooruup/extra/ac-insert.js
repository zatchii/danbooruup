// insert our prototype and scriptaculous scripts into the page
// vim:set encoding=utf-8:
try {
for(var i=0; i < script_arr.length; i++)
{
	var s = document.createElement("script");
	s.setAttribute("type","text/javascript");
	s.appendChild(document.createTextNode(
				"//<![CDATA[\n" +
				script_arr[i] +
				"\n//]]>"
				)
			);
	document.getElementsByTagName("head")[0].appendChild(s);
}
}catch(e){GM_log(e);}
var Autocompleter_DanbooruUp = unsafeWindow.Autocompleter.DanbooruUp;

// the custom selector function for the Autocompleter
function tagSelector(instance) {
	var ret = [];
	var entry	= instance.getToken();
	var tags;

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

	tags = danbooruUpSearchTags(entry);

	if (!tags || !tags.length) return '<ul></ul>';

	tags = tags.slice(0, instance.options.choices);

	var div = document.createElement("div");
	var text = document.createTextNode('');
	div.appendChild(text);;
	for(var i=0; i<tags.length; i++) {
		text.textContent = tags[i];
		tags[i] = div.innerHTML;
	}

	return "<ul><li>" + tags.slice(0, instance.options.choices).join('</li><li>') + "</li></ul>";
}

// get the pixel height of the A element after the big danbooru link to size things in multiples of lines
try {
var lineHeight = document.getElementsByTagName("a")[1].offsetHeight;
} catch(e) { lineHeight = 16; }

// create the CSS
var style = document.createElement("style");
style.innerHTML = ".danbooruup-ac { border: 1px solid black; overflow: auto; background: #fff; min-height: "+lineHeight+"px; z-index: 1000 !important; }\n" +
		".danbooruup-ac ul { min-width: inherit; }\n" +
		".danbooruup-ac li { display: block; text-align: left; background: #fff; margin: 0; padding: 0; padding-left: 4px; padding-right: 4px;}\n" +
		".danbooruup-ac li.selected { background: #ffc; }";
document.getElementsByTagName("head")[0].appendChild(style);

function createAC(elementID, options)
{
	try{
	var foptions = {tokens:[' ','　'], choices:150, selector:tagSelector};
	var ac = null;

	options = options || {};
	for (var p in options) {
		foptions[p] = options[p];
	}

	if(document.getElementById(elementID))
	{
		var div = document.createElement("div");
		var divid = "danbooruup-" + elementID + "-autocomplete";
		div.setAttribute("id", divid);
		div.setAttribute("class","danbooruup-ac");
		div.style.display = 'none';
		document.body.appendChild(div);

		ac = new Autocompleter_DanbooruUp(elementID, divid, [], foptions);
	}
	return ac;
	} catch(ee) { GM_log("danbooruUp: while inserting for " + elementID + ":\n"+ee); }
}

// create the autocomplete popups
// for post/list
if(document.location.href.match(/\/post\/list(\/|$)/))
{
	createAC("search", {isSearchField: true});
}
// for post/view and post/add
else if(document.location.href.match(/\/post\/(view|add)(\/|$)/))
{
	createAC("post_tags");
}
// for rename, set_type
else if(document.location.href.match(/\/tag\/(rename|set_type)(\/|$)/))
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
else if(document.location.href.match(/\/tag\/alias(\/|$)/))
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
