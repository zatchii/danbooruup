// insert our prototype and scriptaculous scripts into the page
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

	if (instance.options.isSearchField && entry[0] == '-') entry = entry.substr(1);

	tags = danbooruUpSearchTags(entry);

	if (!tags || !tags.length) return '';

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

// get the pixel height of an A element to size things in multiples of lines
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

// create the autocomplete popup
if(document.getElementById("search"))
{
	var div1 = document.createElement("div");
	div1.setAttribute("id","danbooruup-autocomplete");
	div1.setAttribute("class","danbooruup-ac");
	div1.style.display = 'none';
	document.body.appendChild(div1);

	ac = new Autocompleter_DanbooruUp("search","danbooruup-autocomplete",[],{tokens:[' ','　'], choices:150, selector:tagSelector, isSearchField: true});
}

// for post/view and post/add
if(document.getElementById("post_tags"))
{
	div2 = document.createElement("div");
	div2.setAttribute("id","danbooruup-pt-autocomplete");
	div2.setAttribute("class","danbooruup-ac");
	div2.style.display = 'none';
	document.body.appendChild(div2);

	ac2 = new Autocompleter_DanbooruUp("post_tags","danbooruup-pt-autocomplete",[],{tokens:[' ','　'], choices:150, selector:tagSelector});
}

