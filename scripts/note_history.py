#/usr/bin/env python2.6
# -*- coding: utf-8 -*-

"""
Downloads a chunk of Danbooru's note history, filters it and writes it to a file for perusal.

Example usage:

Get the last 500 note edits (except from ignored users), with thumbnail previews for posts:
    python note_history.py -n 500 -m 999 -t

Get 20 pages starting at page 60, showing only note deletions.
    python note_history.py -p 60 -m 20 -n 9999 -f d
"""

# Notes from users listed here will not be shown.
ignore_users = [
    u'Soljashy',
    u'recklessfirex',
    u'windward',
    u'_dk',
    u'葉月',
    126,
]

danbooru_location = 'http://danbooru.donmai.us'

cache_location = 'note_history.cache'
thumbnail_location = 'note_history_thumbs'

from optparse import OptionParser

opt_parser = OptionParser()
opt_parser.add_option('-o', dest='out',
        default='note_history.html',
        help="name of output file [default: %default]")
opt_parser.add_option('-p', dest='page', type='int', default=1,
        help="page to start at [default: %default]")
opt_parser.add_option('-n', dest='maxnotes', type='int', default=100,
        help="maximum number of notes to get [default: %default]")
opt_parser.add_option('-m', dest='maxpages', type='int', default=20,
        help="maximum number of pages to get [default: %default]")
opt_parser.add_option('-f', dest='filter', metavar='[amd]', default='amd',
        help="show a=added, m=modified, d=deleted posts [default: %default]")
opt_parser.add_option('-t', dest='thumbnails', action='store_true',
        help="show thumbnails on hover")
opt_parser.add_option('-i', dest='users', action='store_true',
        help="show user summaries on hover")
opt_parser.add_option('-u', dest='username',
        help="username")
opt_parser.add_option('-w', dest='password',
        help="password")
opt_parser.add_option('-v', dest='verbose', action='store_true',
        help="print status messages")

options, args = opt_parser.parse_args()

import sys
import os.path
from datetime import datetime, tzinfo, timedelta
import re
from urllib import urlretrieve
from urllib2 import urlopen
import cPickle as pickle
import json
import hashlib


pwhash = None
if options.username or options.password:
    if options.username and options.password:
        pwhash = hashlib.sha1('choujin-steiner--{0}--'.format(options.password)).hexdigest()
    else:
        sys.stderr.write('Need both username and password to use login!\n');


try:
    with open(cache_location, 'rb') as f:
        cache = pickle.load(f)
    if options.verbose:
        print 'Read cache'
except:
    if options.verbose:
        print 'No cache'
    cache = {'usernames': {}, 'filenames': {}}

def save_cache():
    if options.verbose:
        print 'Writing cache'
    with open(cache_location, 'wb') as f:
        pickle.dump(cache, f, pickle.HIGHEST_PROTOCOL)


def danbooru_open(path):
    if pwhash:
        path += '&login={0}&password_hash={1}'.format(options.username, pwhash)
    return urlopen(danbooru_location + path)

def json_request(path):
    return json.load(danbooru_open(path))


class DBTimezone(tzinfo):
    def utcoffset(self, dt):
        return timedelta(hours=-4)

    def dst(self, dt):
        return timedelta(0)

def de_json_class(data):
    """Replace Time classes in json data with datetimes."""
    if isinstance(data, dict):
        if 'json_class' in data and data['json_class'] == 'Time':
            return datetime.fromtimestamp(data['s'] + data['n'] * 10**-9, DBTimezone())
        else:
            return dict((key, de_json_class(value)) for key, value in data.iteritems())
    elif isinstance(data, list):
        return map(de_json_class, data)
    else:
        return data


def get_note_page(page):
    if options.verbose:
        print "Getting history from page {0}".format(page)
    return de_json_class(json_request('/note/history.json?page={0}'.format(page)))


def note_filter(note):
    # Filter on note type
    if note['version'] == 1 and 'a' not in options.filter:
        return False
    if note['version'] > 1 and note['is_active'] and 'm' not in options.filter:
        if note['is_active']:
            if 'm' not in options.filter:
                return False
        else:
            if 'd' not in options.filter:
                return False

    # Filter on user
    if ignore_users and note['creator_id'] in ignore_users or username(note['creator_id']) in ignore_users:
        return False
    return True


class History:
    def __init__(self, start_page, max_pages, max_notes):
        page = start_page - 1
        max_page = start_page + max_pages - 1
        notes = []
        seen = set()
        allseen = set()
        while (page + 1 <= max_page and len(notes) < max_notes):
            page += 1
            page_notes = get_note_page(page)
            if not page_notes:
                break
            allseen.update((note['note_id'], note['version']) for note in page_notes)
            for note in filter(note_filter, page_notes):
                if (note['note_id'], note['version']) in seen:
                    continue
                if len(notes) >= max_notes:
                    break
                notes.append(note)
                seen.add((note['note_id'], note['version']))
        self.notes = notes
        self.start_page = start_page
        self.last_page = page
        self.ignored_notes = allseen - seen


def download_thumbnail(post_id):
    """Download the preview image for a post and return the relative file path."""
    if options.verbose:
        print "Getting thumbnail for post {0}".format(post_id)
    if not os.path.exists(thumbnail_location):
        os.mkdir(thumbnail_location)
    if post_id in cache['filenames']:
        path = os.path.join(thumbnail_location, cache['filenames'][post_id])
        if os.path.exists(path):
            return path
    post_data = json_request('/post/index.json?tags=id:{0}'.format(post_id))[0]
    preview_url = post_data['preview_url']
    filename = preview_url.split('/')[-1]
    path = os.path.join(thumbnail_location, filename)
    if not os.path.exists(path):
        if options.verbose:
            print "Downloading..."
        urlretrieve(preview_url, path)
    cache['filenames'][post_id] = filename

    return path


def username(user_id):
    if user_id in cache['usernames']:
        return cache['usernames'][user_id]
    if options.verbose:
        print 'Asking name of user {0}'.format(user_id)
    user = json_request('/user/index.json?id={0}'.format(user_id))[0]
    cache['usernames'][user_id] = user['name']
    return user['name']

user_summaries = {}
def user_summary(user_id):
    """Get a summary of the user profile, à la the user profile page.
       Actually, that's where we parse it from, as the numbers don't seem to be easily available from the API."""
    if (user_id in user_summaries):
        return user_summaries[user_id]
    if (options.verbose):
        print "Getting user data for user {0}".format(user_id)

    page = danbooru_open('/user/show?id={0}'.format(user_id)).read()
    # We get an html-escaped name here.
    name = re.search('<h2>(.*)</h2>', page).group(1)

    def s(str):
        return re.search('ng>'+str+'.*?<td.*?>([^<>]*)</td', page, re.DOTALL).group(1).strip()

    def si(str):
        return int(re.search('ng>'+str+r'.*?>(\d+)</a', page, re.DOTALL).group(1))

    summary = {'id': user_id, 'name': name, 'join_date': s('Join Date'), 'level': s('Level'), 'posts': si('Posts'),
            'favorites': si('Favorites'), 'comments': si('Comments'), 'tag_edits': si('Tag Edits'),
            'note_edits': si('Note Edits'), 'record': re.search(r'ng>Record.*>([^<>]*)\(<a', page, re.DOTALL).group(1).strip()}
    user_summaries[user_id] = summary;
    return summary;





### HTML output functions

import cgi

def id_to_color(id):
    return 'rgb({0}, {1}, {2})'.format((id & 255), (id >> 8 & 255), (id >> 16 & 255))

he = cgi.escape

def link(text, url):
    return '<a href="{0}{1}">{2}</a>'.format(danbooru_location, url, text)


def note_row(note):
    return """<tr>
    <td style="background: {color};"></td>
    <td>{post}</td>
    <td>{note}</td>
    <td>{body}</td>
    <td>{user}</td>
    <td>{date}</td>
</tr>\n""".format(color = id_to_color(note['post_id']),
        post = link(note['post_id'], '/post/show/{0}'.format(note['post_id'])),
        note = link('{0}.{1}'.format(note['note_id'], note['version']), '/note/history/{0}'.format(note['note_id'])),
        body = he(note['body'].encode('utf-8')) + ('' if note['is_active'] else ' (deleted)'),
        user = link(he(username(note['creator_id']).encode('utf-8')), '/user/show/{0}'.format(note['creator_id'])),
        date = note['updated_at'].strftime('%Y-%m-%d %H:%M')
    )


def history_table(notes):
    """Make the note history table"""

    content = ["""<table id="notes" width="100%">
  <thead>
    <tr>
      <th></th>
      <th width="5%">Post</th>
      <th width="5%">Note</th>
      <th width="67%">Body</th>
      <th width="10%">Edited By</th>
      <th width="13%">Date</th>
    </tr>
  </thead>
  <tbody>
  """]

    content.extend(note_row(note) for note in notes)

    content.append("""</tbody>
</table>\n""")
    return ''.join(content)


def info_header(history):
    # Don't print password
    cmdl = sys.argv
    for i in xrange(1, len(cmdl)):
        if cmdl[i-1] == '-w':
            cmdl[i] = '***'

    return """
    <p><i>Got {notecount} notes from {pagecount} pages, page {pagefrom} to {pageto}</i></p>
    <p><i>Gotten {date:%Y-%m-%d %H:%M}, called as {cmdline}</i></p>
    <p><i>Ignoring approx. {ignorednotes} notes from users {ignoreusers}</i></p>
    """.format(
        notecount = len(history.notes),
        pagecount = history.last_page - history.start_page + 1,
        pagefrom = history.start_page,
        pageto = history.last_page,
        date = datetime.now(),
        cmdline = ' '.join(sys.argv),
        ignorednotes = len(history.ignored_notes),
        ignoreusers = ', '.join(he(unicode(u).encode('utf-8')) for u in ignore_users)
    )


def thumb_js(notes):
    content = ["""<script type="text/javascript">
        document.addEventListener('DOMContentLoaded', 
        function() {
        var thumb_box;
        var thumb_urls = """]
    content.append(json.dumps( dict((note['post_id'], download_thumbnail(note['post_id'])) for note in notes) ))
    content.append(';')
    content.append("""
        function make_thumb_box(uri) {
            var box = document.createElement('div');
            box.className = 'popup';
            box.appendChild(document.createElement('img')).src = uri;
            return box;
        }

        function thumb_over(ev) {
            var id = ev.target.firstChild.data;
            thumb_box = make_thumb_box(thumb_urls[id])
            thumb_box.style.top = (ev.pageY + 10) + 'px';
            document.getElementById('notes').appendChild(thumb_box);
        }
        function thumb_out(ev) {
            if (thumb_box)
                thumb_box.parentNode.removeChild(thumb_box);
            thumb_box = null;
        }
        var rows = document.getElementById('notes').getElementsByTagName('tr');
        for (var i = 1; i < rows.length; i++) {
            var cols = rows[i].getElementsByTagName('td');
            var ptd_a = cols[1].firstChild;
            ptd_a.addEventListener('mouseover', thumb_over, true);
            ptd_a.addEventListener('mouseout', thumb_out, true);
        }
        
        }, true);
</script>""")

    return ''.join(content)


def userinfo_js(notes):
    content = ["""<script type="text/javascript">
        document.addEventListener('DOMContentLoaded', 
        function() {
        var user_box;
        var user_data = """]
    content.append(json.dumps( dict((note['creator_id'], user_summary(note['creator_id'])) for note in notes) ))
    content.append(';')
    content.append("""
        function make_user_box(user) {
            var box = document.createElement('div');
            box.className = 'popup';
            table = box.appendChild(document.createElement('table'));
            [['Name', 'name'],
                ['Level','level'],
                ['Joined','join_date'],
                ['Note Edits','note_edits'],
                ['Tag Edits', 'tag_edits'],
                ['Posts','posts'],
                ['Comments','comments'],
                ['Favorites','favorites'],
                ['Record','record']].forEach(function(x) {
                    var tr = table.appendChild(document.createElement('tr'));
                    tr.appendChild(document.createElement('th')).appendChild(document.createTextNode(x[0]));
                    tr.appendChild(document.createElement('td')).innerHTML = user[x[1]];
            });
            return box;
        }

        function user_over(ev) {
            var id = /\d+/.exec(ev.target.href)[0];
            user_box = make_user_box(user_data[id])
            user_box.style.top = (ev.pageY + 10) + 'px';
            user_box.style.left = (ev.pageX) + 'px';
            document.getElementById('notes').appendChild(user_box);
        }
        function user_out(ev) {
            if (user_box)
                user_box.parentNode.removeChild(user_box);
            user_box = null;
        }
        var rows = document.getElementById('notes').getElementsByTagName('tr');
        for (var i = 1; i < rows.length; i++) {
            var cols = rows[i].getElementsByTagName('td');
            var utd_a = cols[4].firstChild;
            utd_a.addEventListener('mouseover', user_over, true);
            utd_a.addEventListener('mouseout', user_out, true);
        }
        
        }, true);
</script>""")

    return ''.join(content)


frame_top = """<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>Note History</title>
  <style type="text/css">
    body, div, h1, h2, h3, h4, h5, h6, p, ul, li, dd, dt {
        font-family: verdana, sans-serif;
        margin: 0;
        padding: 0;
    }

    h1, h2, h3, h4 {
        font-family: Tahoma;
    }

    body {
        font-size: 80%;
        padding: 0;
        margin: 0;
    }

    table {
        margin-bottom: 2em;
    }

    table td {
        padding: 1px 4px; 
        vertical-align: top;
    }

    table th {
        font-weight: bold;
        text-align: left;
        vertical-align: top;
        padding: 0.2em 0.5em;
        white-space: nowrap;
    }

    a:link {
        color: #006FFA;
        text-decoration: none;
    }

    .blacklisted-tags-disabled {
        color: #AAA !important;
    }

    a:visited {
        color: #006FFA;
        text-decoration: none;
    }

    a:hover {
        color: #9093FF;
        text-decoration: none;
    }

    a:active {
        color: #006FFA;
        text-decoration: none;
    }

    div#content {
        padding: 0 20px 30px 20px;
    }

    .popup {
        background-color: #FFE;
        position: absolute;
        padding: 0.5em;
        border: 1px solid black;
        font-size: smaller;
    }

    .popup table, .popup tr, .popup th, .popup td {
        margin: 0;
        padding: 0;
    }

    .popup td {
        padding-left: 1em;
    }
  </style>
  %SCRIPTS
</head>
<body>
<div id="content">
"""

frame_bottom = """</div>
</body>
</html>"""




### Main

with open(options.out, 'wb') as outfile:
    history = History(options.page, options.maxpages, options.maxnotes)
    ft = frame_top.replace('%SCRIPTS', (thumb_js(history.notes) if options.thumbnails else '') +
            (userinfo_js(history.notes) if options.users else ''))
    outfile.write(ft)
    outfile.write(info_header(history))
    outfile.write(history_table(history.notes))
    outfile.write(frame_bottom)

save_cache()
