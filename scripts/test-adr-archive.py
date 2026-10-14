"""Validate archive coverage, exact edited bodies, disclosure markers and links."""
import hashlib
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

site = Path(__file__).resolve().parents[1]
a = json.loads((site/'src/data/adr-archive.json').read_text())
journey = json.loads((site/'src/data/journey-data.json').read_text())
before = json.loads((site/'src/data/journey-original-data.json').read_text())
assert len(a['records']) == 81
assert len({r['slug'] for r in a['records']}) == 81
assert Counter(r['legacy'] for r in a['records']) == {False:74, True:7}
assert Counter(r['status'] for r in a['records']) == {'accepted':48,'proposed':29,'superseded':3,'withdrawn':1}
assert all(r['recordDate'] <= a['cutoff'] for r in a['records'])

def identity(m):
    return m.get('stableId') or m['date']+'-'+re.sub(r'[^a-z0-9]+','-',m['title'].lower()).strip('-')
assert len(journey['milestones']) == 143
assert len({identity(m) for m in journey['milestones']}) == 143
assert {identity(m) for m in before['milestones']} <= {identity(m) for m in journey['milestones']}
optional=[m for m in journey['milestones'] if m['kind']=='decision']
assert Counter(m['recordKind'] for m in optional) == {'adr':74,'historical-note':4,'legacy-record':7}
assert len({m['nodes'][0]['id'] for m in optional}) == 85
assert len({m['link']['href'] for m in optional}) == 85
assert journey['journalCutoff'] == '2026-06-14'

patterns = {
    'private address':r'\b(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)\b',
    'user path':r'/Users/|/home/|/Volumes/Workspace SSD|/mnt/2tb',
    'employer identity':r'\bBT\b|BT-Work|bt__',
    'credential format':r'(?<![\w-])(?:sk-ant-|pplx-|ghp_|github_pat_|glpat-)[A-Za-z0-9_-]{4,}',
    'private webhook':r'discord(?:app)?\.com/api/webhooks/\d+/\S+',
    'private benchmark identity':r'2e9b77c9|63007288',
}
for rec in a['records']:
    text = (site/'src/content/adrs'/f"{rec['slug']}.md").read_text()
    _, head, body = text.split('---',2)
    assert hashlib.sha256(body.lstrip('\n').encode()).hexdigest() == rec['publicBodySha256']
    assert re.search(r'^public: true$', head, re.M)
    assert json.loads(re.search(r'^recordedStatus: (.+)$',head,re.M)[1]) == rec['recordedStatus']
    for category,pattern in patterns.items():
        assert not re.search(pattern,text), (rec['slug'],category)
    html = (site/'dist/adrs'/rec['slug']/'index.html').read_text()
    assert rec['sourceSha256'] in html
    assert 'Source and disclosure notes' in html
    if rec['laterAmendments']: assert 'Later amendments retained' in html
    if rec['identityNote']: assert 'adr-identity-note' in html

# Regression: Mermaid [[subroutine]] syntax must never become a vault link.
obs = (site/'src/content/adrs/053-observability-data-routing.md').read_text()
assert 'VEC[["Vector: consume + VRL + fan-out"]]' in obs
assert 'accepted-with-caveats' in (site/'src/content/adrs/046-memory-system-embedder-architecture.md').read_text()
assert 'Superseded-in-part-by-ADR-050' in (site/'src/content/adrs/049-personal-industry-radar-pipeline.md').read_text()
assert 'risk-free validation' in (site/'src/content/adrs/025-trading-intelligence-platform.md').read_text()
assert 'task-trajectory reuse' in (site/'src/content/adrs/045-memory-eval-methodology-v2.md').read_text()
assert next(r for r in a['records'] if r['id']==31)['duplicateOf'].startswith('/adrs/032-')

class Page(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]; self.ids=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if 'id' in d:self.ids.append(d['id'])
        if tag=='a' and 'href' in d:self.links.append(d['href'])

links=0
for p in (site/'dist/adrs').glob('**/index.html'):
    doc=Page();doc.feed(p.read_text())
    for href in doc.links:
        u=urlsplit(href)
        assert not any(x in href for x in ['REDACTED','.atlassian.net','.svc']), (p.name,'private link')
        if u.scheme or href.startswith('//'):continue
        target=(site/'dist'/u.path.lstrip('/') if u.path.startswith('/') else p.parent/u.path) if u.path else p
        if target.is_dir() or not target.suffix:target=target/'index.html'
        assert target.exists(),(str(p),href)
        if u.fragment:
            dest=Page();dest.feed(target.read_text());assert unquote(u.fragment) in dest.ids,(str(p),href)
        links+=1

result={'status':'PASS','sourceDocuments':81,'canonicalRecords':74,'legacyRecords':7,'historicalNotes':4,'preservedOldJourneyIds':len(before['milestones']),'milestones':143,'journalCutoff':journey['journalCutoff'],'archiveCutoff':a['cutoff'],'internalLinksAndFragmentsChecked':links,'disclosureScan':'no residual matches for enumerated patterns; not a guarantee of exhaustive secret detection','privateEvidenceOutsideDist':True}
assert len(list((site/'src/content/adrs').glob('*.md'))) == 85
adr46 = (site/'src/content/adrs/046-memory-system-embedder-architecture.md').read_text()
assert '21:00 UK' not in adr46 and '~22:00' not in adr46
for relative in ['rootweaver/index.html','journey/index.html','adrs/index.html','index.html']:
    html=(site/'dist'/relative).read_text()
    assert 'Local preview' not in html and 'working preview' not in html
    assert '/platform-examples/' not in html
assert not (site/'dist/platform-examples').exists()
result['dayPrecision']='PASS'
result['productionRoutes']='PASS'
print(json.dumps(result,indent=2))
