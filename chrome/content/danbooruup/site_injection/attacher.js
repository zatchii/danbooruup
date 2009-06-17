

function danbooruUpACAttacher(id)
{
	var el = document.getElementById(id);
	if (!el)
		return;

	el.setAttribute('autocomplete', 'off');
	new AutoCompleter(el, danbooruUpCompleter, danbooruACHTMLPopup);
	//alert('Attached to ' + id);
}

function inhibitForm(id) {
	var el = document.getElementById(id);
	if (!el)
		return;
	// There's some javascript trickery going on that takes our enter key,
	// so do some trickery on our own.
	submit = el.submit;
	var stopf = function() {
		var target = null;
		try {
			target = stopf.caller.arguments[0].target;
		} catch (e) { 
			target = el.getElementsByTagName('textarea')[0];
		}
		if (target && target.danbooruUpAutoCompleter) {
			if (!target.danbooruUpAutoCompleter.onEnter()) {
				submit.call(el);
			}
		}
	};
	el.submit = stopf;
	//alert('tried to inhibit ' + id);
}

// Shrink the div around the input box on the front page so the popup won't go off to the left
if (document.location.pathname == '/') {
	try {
		let inp = document.getElementById('tags');
		inp.parentNode.style.display = 'table-cell';
		let div = inp.parentNode.parentNode.parentNode;
		div.style.display = 'table';
		div.style.margin = '0 auto 2em';
		
	} catch (e) { };
}

inhibitForm('edit-form');	// Post view and upload
danbooruUpACAttacher('tags');	// Front and side
danbooruUpACAttacher('post_tags');	// Post view and upload
danbooruUpACAttacher('tag_name');	// Tag edit
danbooruUpACAttacher('tag_alias_name');	// Tag alias
danbooruUpACAttacher('tag_alias_alias');	// Tag alias
danbooruUpACAttacher('tag_implication_predicate');	// Tag alias
danbooruUpACAttacher('tag_implication_consequent');	// Tag alias
danbooruUpACAttacher('user_blacklisted_tags');	// Tag alias
danbooruUpACAttacher('user_uploaded_tags');	// Tag alias

if (document.location.href.match(/\/tag(\/|$)/)) {	// Tag search
	danbooruUpACAttacher('name');
}
if (document.location.href.match(/\/tag_(alias|implication)(\/|\?|$)/)) {	// Tag alias/implication
	danbooruUpACAttacher('query');
}
if (document.location.href.match(/\/wiki(\/|$)/)) {
	danbooruUpACAttacher('search-box');	// Wiki side bar
	danbooruUpACAttacher('wiki_page_title');	// Wiki add
}
if (document.location.href.match(/\/tag_subscription(\/|$)/)) {
	// User subscriptions. Tricky.
	// TODO: Bind new fields as they're ajax-added
	let subscriptionInputs = document.getElementsByTagName('input');
	for (var i = 0; i < subscriptionInputs.length; i++) {
		if (subscriptionInputs[i].id.match(/tag_query/))
			danbooruUpACAttacher(subscriptionInputs[i].id);
	}
}
