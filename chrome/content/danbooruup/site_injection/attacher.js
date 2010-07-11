

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
			// Inform autocompleter of submission and allow it to cancel action.
			if (!target.danbooruUpAutoCompleter.onEnter()) {
				target.danbooruUpAutoCompleter.onSubmit();
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
danbooruUpACAttacher('tag_name', 'search_single');	// Tag edit
danbooruUpACAttacher('tag_alias_name', 'search_single');	// Tag alias
danbooruUpACAttacher('tag_alias_alias', 'search_single');	// Tag alias
danbooruUpACAttacher('tag_implication_predicate', 'search_single');	// Tag alias
danbooruUpACAttacher('tag_implication_consequent', 'search_single');	// Tag alias
danbooruUpACAttacher('user_blacklisted_tags');	// Tag alias
danbooruUpACAttacher('user_uploaded_tags');	// Tag alias

if (document.location.href.match(/\/tag(\/|\?|$)/)) {	// Tag search
	danbooruUpACAttacher('name', 'search_single');
}
if (document.location.href.match(/\/tag_(alias|implication)(\/|\?|$)/)) {	// Tag alias/implication
	danbooruUpACAttacher('query', 'search_single');
}
if (document.location.href.match(/\/wiki(\/|$)/)) {
	danbooruUpACAttacher('search-box');	// Wiki side bar
	danbooruUpACAttacher('wiki_page_title', 'search_single');	// Wiki add
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
