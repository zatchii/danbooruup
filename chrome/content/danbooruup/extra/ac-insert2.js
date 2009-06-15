
// Insert the other script functions.
try {
for (var i=0; i < script_arr.length; i++)
{
	var s = document.createElement("script");
	s.setAttribute("type","text/javascript;version=1.7");
	s.appendChild(document.createTextNode(
			"//<![CDATA[\n" +
			script_arr[i]
			+ "\n//]]>"
			)
		);
	document.getElementsByTagName("head")[0].appendChild(s);
}
}catch(e){GM_log("danbooruUp: while injecting scripts: "+e);}


// create the CSS
var cssdec = '.danbooru-autocomplete { border: 1px solid black; overflow: auto; background: #fff; min-height: 1em; z-index: 1000 !important; ' +
	'width: 20em; position: absolute;}\n';
		//".danbooruup-ac > ul > li { display: block; text-align: left; background: #fff; margin: 0; padding: 0; padding-left: 4px; padding-right: 4px;}\n" +
		//".danbooruup-ac > ul > li.selected { background: #ffc; }\n";

// tag style rules
for (rule in style_arr) {
	cssdec += ".danbooru-autocomplete .danbooru-tagtype-" + (/\.selected$/.test(rule) ? rule[0] + '[selected="selected"]' : rule) +
		" { " + style_arr[rule] + " }\n";
}

// add the CSS
var style = document.createElement("style");
style.innerHTML = cssdec;
document.getElementsByTagName("head")[0].appendChild(style);
