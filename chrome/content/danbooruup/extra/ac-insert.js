function tagSelector(instance) {
	var entry	= instance.getToken();
	var tags;

	if (entry.indexOf('*') == -1)
		entry += '%';
	else
		entry = entry.replace(/\*/g, '%');

	tags = window.danbooruUpSearchTags(entry);

	if (!tags) return;

	for (var i = 0; i < tags.length &&
			ret.length < instance.options.choices ; i++) {
		var elem = tags[i];
		ret.push("<li>" + elem + "</li>");
	}

	return "<ul>" + ret.join('') + "</ul>";
}

// get the pixel height of an LI element to size things in multiples of LI elements
var lineHeight = document.getElementsByTagName("li")[0].offsetHeight;

// create the CSS
style = document.createElement("style");
style.innerHTML = ".danbooruup-ac { border: 1px solid black; overflow: auto; background: #fff; min-height: "+lineHeight+"px;}\n.danbooruup-ac ul { min-width: inherit; }\n.danbooruup-ac li { display: block; text-align: left; background: #fff; margin: 0; padding: 0; padding-left: 4px; padding-right: 4px;}\n.danbooruup-ac li.selected { background: #ffc; }";
document.getElementsByTagName("head")[0].appendChild(style);

// create the autocomplete popup
div1 = document.createElement("div");
div1.setAttribute("id","danbooruup-autocomplete");
div1.setAttribute("class","danbooruup-ac");
div1.style.minWidth = ($("search").offsetWidth+2)+'px';
div1.style.height = (lineHeight*20) + 'px';
$("search").parentNode.appendChild(div1);

ac = new Autocompleter.Local('search','danbooruup-autocomplete',[],{tokens:[' ','　'], choices:200, selector:tagSelector});

// for post/view
if($('post_tags'))
{
	div2 = document.createElement('div');
	div2.setAttribute("id","danbooruup-pt-autocomplete");
	div2.setAttribute("class","danbooruup-ac");
	div2.style.minWidth = ($("post_tags").offsetWidth+2)+'px';

	var height = $("edit").parentNode.clientHeight -	// post/view area
		$("edit").offsetTop - $("edit").parentNode.offsetTop -	// minus the image and post bar, and the header
		($("post_tags").offsetTop - $("edit").offsetTop + $("post_tags").offsetHeight);
	// minus the space between the top of the edit div and the cottom of the post_tags input
	height -= height % lineHeight;
	div2.style.height = height+'px';

	$('edit').appendChild(div2);
	ac2 = new Autocompleter.Local('post_tags','danbooruup-pt-autocomplete',[],{tokens:[' ','　'], choices:200, selector:tagSelector});
}

