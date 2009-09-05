#/usr/bin/env python2.6
# -*- coding: utf-8 -*-


"""
Given a file with a list of user ids, lets you run searches and generate reports on them.

The user id file is just numbers separated by any non-digits, so user urls will work fine.

Example usage:

Show note edits and records for users in userids.txt, ordered by number of note edits.
    python sort_users.py -t html -r -n userids.txt order:note_edits > output.html

Show advanced note statistics for users in userids.txt with one or more note deletion, ordered descendingly by date of last note edit.
    python sort_users.py -t html -a userids.txt note_deletions:1.. order:note_last_edit_desc > output.html

Users with status between privileged and janitor who have 5 or more no-change note saves and no note additions
    python sort_users.py -t html -a userids.txt level:privileged..janitor note_nops:5.. note_adds:0
"""

danbooru_location = 'http://danbooru.donmai.us'

cache_location = 'sort_users.cache'
max_cache_age = 15 * 60

from optparse import OptionParser

opt_parser = OptionParser(usage='Usage: %prog [options] useridfile criteria...')
opt_parser.add_option('-f', dest='format', default='text', type='choice', choices=('text', 'html', 'ids'),
        help="format results as text, html or ids [default: %default]")
opt_parser.add_option('-a', dest='notestat', default=False, action='store_true',
        help="show advanced note statistics")
opt_parser.add_option('-n', dest='notes', default=False, action='store_true',
        help="show note edits (html only)")
opt_parser.add_option('-r', dest='records', default=False, action='store_true',
        help="show user records (html only)")
opt_parser.add_option('-s', dest='totalstats', default=False, action='store_true',
        help="show totals and averages over users")
opt_parser.add_option('-u', dest='username',
        help="username")
opt_parser.add_option('-w', dest='password',
        help="password")
opt_parser.add_option('-v', dest='verbose', action='store_true',
        help="print status messages")

options, args = opt_parser.parse_args()

import sys
from datetime import datetime, tzinfo, timedelta
import time
import re
from urllib2 import urlopen, HTTPError
import cPickle as pickle
import json
import hashlib

pwhash = None
if options.username or options.password:
    if options.username and options.password:
        pwhash = hashlib.sha1('choujin-steiner--{0}--'.format(options.password)).hexdigest()
    else:
        sys.stderr.write('Need both username and password to use login!\n');

class DBTimezone(tzinfo):
    def utcoffset(self, dt):
        return timedelta(hours=-4)

    def dst(self, dt):
        return timedelta(0)

try:
    with open(cache_location, 'rb') as f:
        cache = pickle.load(f)
    if cache['gen_time'] + max_cache_age < time.time():
        if options.verbose:
            print 'Cache too old, discarding'
        raise Exception('Cache too old')
    if options.verbose:
        print 'Read cache'
except:
    if options.verbose:
        print 'No cache'
    cache = {'gen_time': time.time(),
            'user_summary': {}, 'user_records': {}, 'user_note_history': {},
            'note_history': {}}

import functools

def cached(fun):
    section = fun.__name__
    @functools.wraps(fun)
    def f(x):
        if x in cache[section]:
            return cache[section][x]
        else:
            v = fun(x)
            cache[section][x] = v
            return v
    return f

def save_cache():
    if options.verbose:
        print 'Writing cache'
    with open(cache_location, 'wb') as f:
        pickle.dump(cache, f, pickle.HIGHEST_PROTOCOL)


def danbooru_open(path):
    if pwhash:
        path += '&login={0}&password_hash={1}'.format(options.username, pwhash)
    try:
        return urlopen(danbooru_location + path)
    except HTTPError as e:
        raise Exception('Error loading {0}, '.format(path) + str(e))

def json_request(path):
    return json.load(danbooru_open(path))

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


def dehtml(text):
    return text.replace('&quot;', '"').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')

@cached
def user_summary(user_id):
    """Get a summary of the user profile, à la the user profile page.
       Actually, that's where we parse it from, as the numbers don't seem to be easily available from the API."""
    if (options.verbose):
        print "Getting user data for user {0}".format(user_id)

    page = danbooru_open('/user/show?id={0}'.format(user_id)).read()
    # We get an html-escaped name here.
    name = re.search('<h2>(.*)</h2>', page).group(1)

    def s(str):
        return re.search('ng>'+str+'.*?<td.*?>([^<>]*)</td', page, re.DOTALL).group(1).strip()

    def si(str):
        return int(re.search('ng>'+str+r'.*?>(\d+)</a', page, re.DOTALL).group(1))

    summary = {'id': user_id, 'name': dehtml(name).decode('utf-8'), 'join_date': s('Join Date'), 'level': ' '.join(s('Level').split()), 'posts': si('Posts'),
            'favorites': si('Favorites'), 'comments': si('Comments'), 'tag_edits': si('Tag Edits'),
            'note_edits': si('Note Edits'), 'record': re.search(r'ng>Record.*>([^<>]*)\(<a', page, re.DOTALL).group(1).strip(),
            'forum_posts': si('Forum Posts'), 'pool_updates': si('Pool Updates'), 'wiki_edits': si('Wiki Edits'), 'deleted_posts': si('Deleted Posts')}
    return summary;


@cached
def user_records(user_id):
    # No API, grab the whole table.
    page = danbooru_open('/user_record?user_id={0}'.format(user_id)).read()
    table = re.search('<table.*</table>', page, re.DOTALL).group(0)
    if not 'record' in table:
        return None

    # Make links absolute
    table = table.replace('<a href="/', '<a href="' + danbooru_location + '/')
    return table


def read_note_pages(url):
    notes = []
    page = 1
    seen = set()
    while True:
        page_notes = json_request(url + '&page={0}'.format(page))
        if not page_notes:
            break
        notes.extend(note for note in page_notes if not (note['note_id'], note['version']) in seen)
        seen.update((note['note_id'], note['version']) for note in notes)
        page += 1
    return de_json_class(notes)

@cached
def user_note_history(user_id):
    if options.verbose:
        print "Getting note history for user {0}".format(user_id)
    return read_note_pages('/note/history.json?user_id={0}'.format(user_id))

def note_history(note_id, post_id):
    if options.verbose:
        print "Getting note history for note {0}".format(note_id)
    if note_id not in cache['note_history']:
        notes = {}
        for note in read_note_pages('/note/history.json?post_id={0}'.format(post_id)):
            if note['note_id'] not in notes:
                notes[note['note_id']] = []
            notes[note['note_id']].append(note)

        cache['note_history'].update(notes)
    return cache['note_history'][note_id]


def advanced_note_stats(user_id):
    """Calculate advanced note statistics"""
    note_adds = 0
    note_deletions = 0
    note_restores = 0
    note_mods = 0
    note_resizes = 0
    note_nops = 0

    note_last_edit = datetime.min.replace(year=1900, tzinfo=DBTimezone())
    note_first_edit = datetime.max.replace(tzinfo=DBTimezone())

    def note_pos(note):
        return tuple(note[attr] for attr in ('x', 'y', 'width', 'height'))

    notes = user_note_history(user_id)
    for note in notes:
        note_last_edit = max(note['updated_at'], note_last_edit)
        note_first_edit = min(note['updated_at'], note_first_edit)

        if note['version'] == 1:
            note_adds += 1
        else:
            note_h = note_history(note['note_id'], note['post_id'])
            for prev in note_h:
                if prev['version'] < note['version']:
                    break
            assert prev['version'] < note['version']
            
            if prev['is_active'] and not note['is_active']:
                note_deletions += 1
            elif not prev['is_active'] and note['is_active']:
                note_restores += 1
            elif prev['body'] != note['body']:
                note_mods += 1
            elif note_pos(prev) != note_pos(note):
                note_resizes += 1
            else:
                note_nops += 1

    return {'note_adds': note_adds, 'note_deletions': note_deletions, 'note_restores': note_restores,
            'note_resizes': note_resizes, 'note_mods': note_mods, 'note_nops': note_nops,
            'note_first_edit': note_first_edit.strftime('%Y-%m-%d'), 'note_last_edit': note_last_edit.strftime('%Y-%m-%d')}
    


def read_user_ids(filename):
    with open(filename, 'r') as f:
        return map(int, re.findall('\d+', f.read()))


### Criteria

class User(dict):
    def __init__(self, id):
        dict.__init__(self)
        self.id = id
        self['id'] = id

    def __getitem__(self, key):
        if key in self:
            return dict.__getitem__(self, key)
        elif key in summary_fields:
            self.update(user_summary(self.id))
            return dict.__getitem__(self, key)
        elif key in advanced_note_fields:
            self.update(advanced_note_stats(self.id))
            return dict.__getitem__(self, key)
        else:
            raise CriterionError("No field with name '{0}'".format(key))

class TotalUser(dict):
    def __init__(self):
        dict.__init__(self)
        self.nitems = 0

    def update(self, d):
        for k in d:
            if k in self:
                if isinstance(self[k], int) and isinstance(d[k], int):
                    self[k] += d[k]
                else:
                    self[k] = '***'
            else:
                self[k] = d[k]
        self['name'] = 'Total'
        self.nitems += 1

    def average(self):
        av = dict( (k, (float(self[k]) / self.nitems) if isinstance(self[k], int) else '***') for k in self)
        av['name'] = 'Average'
        return av


class CriterionError(Exception):
    pass


def orderer(field):
    if field not in all_fields:
        raise CriterionError("Can't order on {0}".format(field))
    return all_fields[field].orderer(field)


def range_type(range):
    ranges = [(r'<=(.*)$', '<='),
            (r'<(.*)$', '<'),
            (r'>=(.*)$', '>='),
            (r'>(.*)$', '>'),
            (r'\.\.(.*)$', '<='),
            (r'(.*)\.\.$', '>='),
            (r'(.*)\.\.(.*)$', 'r')]
    for test, type in ranges:
        m = re.match(test, range)
        if m:
            return type, m.groups()
    return 'r', (range, range)


def gen_range_filter(field, rt, values, key = None):
    def f(user):
        v = user[field]
        if key is not None:
            v = key(v)
        if rt == '<':
            return v < values[0]
        elif rt == '>':
            return v > values[0]
        elif rt == '<=':
            return v <= values[0]
        elif rt == '>=':
            return v >= values[0]
        else:
            return values[0] <= v <= values[1]
    return f


def gen_orderer(field):
    def get_user_val(user):
        return user[field]
    return get_user_val


def range_filter(field, range):
    if not field in all_fields:
        raise CriterionError("Unknown field '{0}'".format(field))
    return all_fields[field].range_filter(field, range)


class IntField():
    orderer = staticmethod(gen_orderer)
    @staticmethod
    def range_filter(field, range):
        rt, vs = range_type(range)
        try:
            vs = map(int, vs)
        except:
            raise CriterionError("Integer field '{0}' can't have value '{1}'".format(field, range))
        return gen_range_filter(field, rt, vs)


class StringField:
    orderer = staticmethod(gen_orderer)
    @staticmethod
    def range_filter(field, range):
        rt, vs = range_type(range)
        return gen_range_filter(field, rt, vs)


class LevelField:
    levels = {
        0: 'Unactivated',
        10: 'Blocked',
        20: 'Member',
        30: 'Privileged',
        33: 'Contributor',
        35: 'Janitor',
        40: 'Mod',
        50: 'Admin',
    }
    @classmethod
    def to_int(c, value):
        if value.isdigit():
            return int(value)
        value = value.lower()
        for num, name in c.levels.iteritems():
            # Use startswith because the way we read it, blocked levels include ban reason.
            if value.startswith(name.lower()):
                return num
        raise CriterionError("Level field can't have value '{0}'".format(value))

    @classmethod
    def orderer(c, field):
        def f(user):
            return c.to_int(user[field])
        return f

    @classmethod
    def range_filter(c, field, range):
        rt, vs = range_type(range)
        vs = map(c.to_int, vs)
        return gen_range_filter(field, rt, vs, c.to_int)


summary_fields = {
        'id': IntField,
        'name': StringField,
        'level': LevelField, 
        'join_date': StringField,
        'posts': IntField,
        'deleted_posts': IntField,
        'favorites': IntField,
        'comments': IntField,
        'tag_edits': IntField,
        'note_edits': IntField,
        'wiki_edits': IntField,
        'forum_posts': IntField,
        'pool_updates': IntField,
        'record': IntField,
}

advanced_note_fields = {
        'note_adds': IntField,
        'note_deletions': IntField,
        'note_restores': IntField,
        'note_mods': IntField,
        'note_resizes': IntField,
        'note_nops': IntField,
        'note_first_edit': StringField,
        'note_last_edit': StringField,
}

all_fields = {}
all_fields.update(summary_fields)
all_fields.update(advanced_note_fields)


def order_users(users, criteria):
    u = list(users)
    for criterion in criteria:
        if criterion.startswith('order:'):
            if criterion.endswith('_desc'):
                u.sort(key=orderer(criterion[6:-5]), reverse=True)
            else:
                u.sort(key=orderer(criterion[6:]))
        else:
            m = re.match('(.*?):(.*)', criterion)
            if not m:
                raise CriterionError("Criterion '{0}' not in format field:range".format(criterion))
            u = filter(range_filter(m.group(1), m.group(2)), u)
    return u



### Text output
def text_format_user(user):
    fields = ['name', 'id', 'join_date', 'level', 'posts', 'favorites', 'comments', 'tag_edits', 'note_edits', 'record']
    output = []
    if options.notestat:
        fields.extend(['note_adds', 'note_restores', 'note_mods', 'note_resizes', 'note_deletions', 'note_nops', 'note_first_edit', 'note_last_edit'])
    for field in fields:
        output.append("{0}: {1}".format(field, user[field]))
    return '\n'.join(output)


def text_print_users(users):
    total = TotalUser()
    for user in users:
        print text_format_user(user)
        total.update(user)
        print

    if options.totalstats and users:
        print
        print text_format_user(total)
        print
        print text_format_user(total.average())
        print

def id_print_users(users):
    for user in users:
        print u'{0}: {1}'.format(user['id'], user['name'])


### HTML output

from cgi import escape as he
from urllib import quote as urlquote

def link(text, url):
    return '<a href="{0}{1}">{2}</a>'.format(danbooru_location, url, text)

def html_format_user(user, dummy = False):
    output = ['<div class="user"><h3>{0}</h3>\n<table>'.format(link(user['name'].encode('utf-8'), '/user/show/{0}'.format(user['id'])))]

    fields = [('join_date', ''), ('level', ''),
            ('posts', '/post?tags=user%3A{name}'),
            ('favorites', '/post?tags=fav%3A{name}'),
            ('comments', '/comment/search?query=user%3A{name}'),
            ('tag_edits', '/post_tag_history?user_id={id}'),
            ('note_edits', '/note/history?user_id={id}'),
            ('record', '/user_record?user_id={id}')]

    if options.notestat:
        fields.extend((x, '') for x in ['note_adds', 'note_restores', 'note_mods', 'note_resizes',
            'note_deletions', 'note_nops', 'note_first_edit', 'note_last_edit'])

    even = False
    for field, url in fields:
        if not even:
            output.append('<tr>')
        output.append('<th>{0}</th><td>{1}</td>'.format(field,
            link(user[field], url.format(id=user['id'], name=urlquote(user['name'].encode('utf-8')))) if url else user[field]))
        if even:
            output.append('</tr>')
        even = not even
    output.append('</table>')

    # Records
    if options.records and not dummy:
        records = user_records(user['id'])
        if records:
            output.append('<h4>Record</h4>')
            output.append(records)

    # Notes
    if options.notes and not dummy:
        notes = user_note_history(user['id'])
        if notes:
            output.append('<h4>Notes</h4>')
            output.append(history_table(notes))

    output.append('</div>')

    return '\n'.join(output)


# Note related

def id_to_color(id):
    return 'rgb({0}, {1}, {2})'.format((id & 255), (id >> 8 & 255), (id >> 16 & 255))

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
        user = link(he(user_summary(note['creator_id'])['name'].encode('utf-8')), '/user/show/{0}'.format(note['creator_id'])),
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



def html_print_users(users, criteria, ids):
    print frame_top

    print '<p><i>Searched {0} users on criteria {1}</i></p>'.format(len(ids), he(criteria))
    print '<p><i>Got {0} users</i></i>'.format(len(users))
    print '<p><i>Generated {0:%Y-%m-%d %H:%M}</i></p><br/>'.format(datetime.now())

    total = TotalUser()

    for user in users:
        print html_format_user(user)
        total.update(user)

    if options.totalstats and users:
        print '<br/><br/>'
        print html_format_user(total, True)
        print html_format_user(total.average(), True)

    print frame_bottom


frame_top = """<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>User search</title>
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

    table > tbody > tr.positive-record {
        background: #EFE;
    }

    table > tbody > tr.negative-record {
        background: #FEE;
    }

    .user {
        padding: 1em;
        background: #EEE;
        border: 1px solid grey;
    }
  </style>
</head>
<body>
<div id="content">
"""

frame_bottom = """</div>
</body>
</html>"""


### Main
user_ids = set(read_user_ids(args[0]))
users = [User(id) for id in user_ids]

users = order_users(users, args[1:])

if options.format == 'text':
    text_print_users(users)
elif options.format == 'html':
    html_print_users(users, ' '.join(args[1:]), user_ids)
elif options.format == 'ids':
    id_print_users(users)

save_cache()
