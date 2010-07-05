#!/bin/env python

import xml.sax, json
import os.path
import sys
import re
from StringIO import StringIO
from gzip import GzipFile
from urllib2 import urlopen, Request
from optparse import OptionParser

opt_parser = OptionParser()
opt_parser.add_option('-f', '--tagfile',
        default='http://danbooru.donmai.us/tag/index.xml?limit=0',
        help="XML tag file URL")
opt_parser.add_option('-o', '--outfile',
        default='danbooruUpUserJS.js',
        help="name of output file")
opt_parser.add_option('-d', '--database', action='store_true',
        help="use Web SQL Database to store tags")
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

def patch_template(template):
    # Lots of wrong with this, like that it won't nest
    condition = ['DATABASE'] if options.database else ['NOT_DATABASE']
    for c in condition:
        ifpat = re.compile(r'\n?^IF {0}(.*?)^ENDIF.*?$\n?'.format(c), re.DOTALL + re.MULTILINE)
        # print re.findall(r'^IF {0}(.*)^ENDIF.*$'.format(c), template, re.DOTALL + re.MULTILINE)
        template = ifpat.sub(r'\1', template)
    ifpat = re.compile(r'^IF .*?^ENDIF.*?$\n?', re.DOTALL + re.MULTILINE)
    template = ifpat.sub('', template)

    return template.replace('$ONLOAD_SCRIPTS', '\n'.join(js_onload))


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
# Read tags

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

if not options.database:
    print "Reading tags..."
    xml.sax.parse(urlopen_gzip(options.tagfile), TagParser())
    print

    # Sort tags by tag count
    tags = [tag[:3] for tag in sorted(tags, key=lambda x: -x[3])]


###
print "Writing out file..."
with open(options.outfile, 'w') as of:
    #of.write(js_template.replace('$ONLOAD_SCRIPTS', '\n'.join(js_onload)))
    of.write(patch_template(js_template))
    of.write('\n'.join(js_files))

    if not options.database:
        of.write('danbooruUpACTagArray = ')
        json.dump(tags, of)
        of.write(';\n\n');
