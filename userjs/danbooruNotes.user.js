// ==UserScript==
	// @include http://danbooru.donmai.us/post/show/*
	// @include http://safebooru.donmai.us/post/show/*
// ==/UserScript==
/**
 * Lets you add and save notes by hovering over the image and pressing Ctrl + Shift + A
 *
 * Recommend renaming to danbooruNotes.js if using with Opera.
 */


(function () {

	// Drop privileges in Greasemonkey
	if (typeof window.wrappedJSObject == "object") {
	  location.href = "javascript:(" + encodeURI(arguments.callee.toSource()) + ")();";
	  return;
	}

	var mouse_coord;

	var base_coord;
	var preview_box;


	function ratio()
	{
		var image = document.getElementById('image');
		return image.width / image.getAttribute('data-orig_width');
	}

	function makeNote()
	{
		var noteId = Note.counter
		Note.create(Note.post_id);
		var note = Note.find(noteId);

		var r = ratio();
		note.fullsize = {
			left: preview_box.offsetLeft / r,
			top: preview_box.offsetTop / r,
			width: Math.max(preview_box.clientWidth / r, 10 / r),
			height: Math.max(preview_box.clientHeight / r, 10 / r)
		};
		for (var p in note.fullsize)
			note.old[p] = note.fullsize[p];
		note.adjustScale();
		note.showEditBox(null);

		preview_box.parentNode.removeChild(preview_box);
		preview_box = null;
	}

	function onKeyDown(ev)
	{

		// Cancel note on Escape
		if (preview_box && ev.keyCode == 27) {
			preview_box.parentNode.removeChild(preview_box);
			preview_box = null;
			ev.preventDefault();
			ev.stopPropagation();
			return;
		}

		if (!(ev.keyCode == 65 && ev.ctrlKey && ev.shiftKey))	// Ctrl + Shift + A
			return;
		ev.preventDefault();
		ev.stopPropagation();

		// If a note edit box is open, save the note.
		var editbox = document.getElementById('edit-box');
		if (editbox) {
			Note.find(editbox.noteid).save(null);
			return;
		}

		// If we're placing a note preview, create the note.
		if (preview_box) {
			makeNote();
			return;
		}

		// Start preview box placement.
		var note_container = document.getElementById('note-container');
		preview_box = document.createElement('div');
		preview_box.className = 'note-box unsaved';
		preview_box.style.opacity = 0.2;
		note_container.appendChild(preview_box);
		preview_box.addEventListener('click', onMouseClick, false);

		base_coord = mouse_coord;
		updatePreview();
	}

	function onMouseClick(ev)
	{
		makeNote();
	}

	function updatePreview()
	{
		var ps = preview_box.style;
		ps.left = Math.min(base_coord.x, mouse_coord.x) + 'px';
		ps.top = Math.min(base_coord.y, mouse_coord.y) + 'px';
		ps.width = Math.abs(base_coord.x - mouse_coord.x) + 'px';
		ps.height = Math.abs(base_coord.y - mouse_coord.y) + 'px';
	}

	function onMouseMove(ev)
	{
		var note_container = document.getElementById('note-container');
		mouse_coord = {
			x: ev.pageX - note_container.offsetLeft,
			y: ev.pageY - note_container.offsetTop
		};

		if (preview_box)
			updatePreview();
	}

	document.addEventListener('keydown', onKeyDown, false);

	if (window.opera) {
		document.addEventListener('DOMContentLoaded', function() {
				document.getElementById('image').addEventListener('mousemove', onMouseMove, false);
				document.getElementById('note-container').addEventListener('mousemove', onMouseMove, false);
			},
			false
		);
	} else {
		document.getElementById('image').addEventListener('mousemove', onMouseMove, false);
		document.getElementById('note-container').addEventListener('mousemove', onMouseMove, false);
	}

})();
