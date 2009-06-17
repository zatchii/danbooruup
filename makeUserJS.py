#!/bin/env python

import xml.sax
import json
import os.path
import sys
from StringIO import StringIO
from gzip import GzipFile
from urllib2 import urlopen, Request
from optparse import OptionParser

opt_parser = OptionParser()
opt_parser.add_option('-f', dest='tagfile',
        default='http://danbooru.donmai.us/tag/index.xml?limit=0',
        help="XML tag file URL")
opt_parser.add_option('-o', dest='outfile',
        default='danbooruUpUserJS.js',
        help="name of output file")
options, args = opt_parser.parse_args()


###
print "Loading scripts..."

# Patch to get it working with JavaScript 1.5.
def patchJS(js):
    js = js.replace('let ', 'var ')
    return js

def loadJS(path):
    basepath = sys.path[0]
    filepath = os.path.join(*[basepath] + path)
    try:
        with open(filepath, 'r') as jsfile:
            return patchJS(jsfile.read())
    except:
        print "Could not open {0}".format(filepath)
        sys.exit(1)

js_template = loadJS(['userjs', 'danbooruUpUserJS.js.template'])

js_files = [loadJS(p) for p in (
    ['chrome', 'content', 'danbooruup', 'autoCompleter.js'],
    ['chrome', 'content', 'danbooruup', 'site_injection', 'autoCompleterHTMLPopup.js'],
)]

js_onload = [loadJS(p) for p in (
    ['chrome', 'content', 'danbooruup', 'site_injection', 'ac-insert2.js'],
    ['chrome', 'content', 'danbooruup', 'site_injection', 'attacher.js'],
)]


###
print "Reading tags..."

def urlopen_gzip(url):
    r = Request(url, headers={'Accept-Encoding': 'gzip, identity, *;q=0'})
    f = urlopen(r)
    print "Got response from server..."
    encoding = f.info().getheader('Content-Encoding')
    if encoding and 'gzip' in encoding:
        f = GzipFile(mode='rb', fileobj=StringIO(f.read()))
    return f

tags = []

class TagParser(xml.sax.ContentHandler):
    def startDocument(self):
        self.ntags = 0
    def startElement(self, name, attrs):
        if name == 'tag':
            tags.append(
                (attrs['name'], int(attrs['type']), int(attrs['ambiguous'] == 'true'), int(attrs['count']))
            )
        self.ntags += 1
        if self.ntags & 0xFF == 0:
            print '.',

xml.sax.parse(urlopen_gzip(options.tagfile), TagParser())
print

# Sort tags by tag count
tags = [tag[:3] for tag in sorted(tags, key=lambda x: -x[3])]


###
print "Writing out file..."
with open(options.outfile, 'w') as of:
    of.write(js_template.replace('$ONLOAD_SCRIPTS', '\n'.join(js_onload)))
    of.write('\n'.join(js_files))
    of.write('danbooruUpACTagArray = ')
    json.dump(tags, of)
    of.write(';\n\n');
