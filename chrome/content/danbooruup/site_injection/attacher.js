

function danbooruUpACAttacher(id, search_type)
{
	var el = document.getElementById(id);
	if (!el)
		return;

	if (!search_type) {
		if (id == 'post_tags')
			search_type = document.getElementById('post_old_tags') ? 'update' : 'post';
		else
			search_type = 'search';
	}

	el.setAttribute('autocomplete', 'off');
	var ac = new AutoCompleter(el, danbooruUpCompleter, danbooruACHTMLPopup, search_type);

	var form = el;
	while (form.tagName != 'FORM')
		form = form.parentNode;
	form.addEventListener('submit', function(ev) { ac.onSubmit(); }, false);
}

function inhibitForm(id) {
	var el = document.getElementById(id);
	if (!el)
		return;
	// Capture enter keypresses on the parent element to prevent site scripts
	// from interferring with the enter key.
	el.parentNode.addEventListener('keydown', function(ev) {
		if (ev.target == el &&
				ev.keyCode == KeyEvent.DOM_VK_RETURN &&
				el.danbooruUpAutoCompleter) {
			// Acts on event and stops propagation if appropriate.
			el.danbooruUpAutoCompleter.onKeyDown(ev);
		}
	}, true);

	// Override the submit function as well, in case the form is submitted with javascript.
	var form = el;
	while (form.tagName != 'FORM')
		form = form.parentNode;
	var submit = form.submit;
	form.submit = function() {
		if (el.danbooruUpAutoCompleter)
			el.danbooruUpAutoCompleter.onSubmit();
		submit.call(form);
	}
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

inhibitForm('post_tags');	// Post view and upload
danbooruUpACAttacher('post_tags');

inhibitForm('post_tag_string');	// Post view , Danbooru 2
danbooruUpACAttacher('post_tag_string', 'update');

inhibitForm('upload_tag_string');	// Post upload, Danbooru 2
danbooruUpACAttacher('upload_tag_string', 'post');

danbooruUpACAttacher('tags');	// Front and side
danbooruUpACAttacher('tag_name', 'search_single');	// Tag edit
danbooruUpACAttacher('tag_alias_name', 'search_single');	// Tag alias
danbooruUpACAttacher('tag_alias_alias', 'search_single');	// Tag alias
danbooruUpACAttacher('tag_implication_predicate', 'search_single');	// Tag implication
danbooruUpACAttacher('tag_implication_consequent', 'search_single');	// Tag implication
danbooruUpACAttacher('user_blacklisted_tags');	// User prefs
danbooruUpACAttacher('user_uploaded_tags');	// User prefs
danbooruUpACAttacher('user_favorite_tags');	// User prefs, Danbooru 2

if (document.location.href.match(/\/tags?(\/|\?|$)/)) {	// Tag search
	danbooruUpACAttacher('name', 'search_single');
	danbooruUpACAttacher('quick_search_name_matches', 'search_single');
	danbooruUpACAttacher('search_name_matches', 'search_single');
}
if (document.location.href.match(/\/tag_(alias(es)?|implications?)(\/|\?|$)/)) {	// Tag alias/implication
	danbooruUpACAttacher('query', 'search_single');
}
if (document.location.href.match(/\/wiki(_pages)?(\/|$)/)) {
	danbooruUpACAttacher('search-box');	// Wiki side bar
	danbooruUpACAttacher('search_title', 'search_single');	// Wiki side bar, Danbooru 2
	danbooruUpACAttacher('quick_search_title', 'search_single');	// Wiki side bar, Danbooru 2
	danbooruUpACAttacher('wiki_page_title', 'search_single');	// Wiki add
}
if (document.location.href.match(/\/tag_subscriptions?(\/|$)/)) {
	// User subscriptions. Tricky.
	// TODO: Bind new fields as they're ajax-added
	let subscriptionInputs = document.getElementsByTagName('input');
	for (var i = 0; i < subscriptionInputs.length; i++) {
		if (subscriptionInputs[i].id.match(/tag_query/))
			danbooruUpACAttacher(subscriptionInputs[i].id);
	}
}
