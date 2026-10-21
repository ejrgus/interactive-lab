"""Cache public LG Energy Solution originals. No account or private data is accessed."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

SINCE, UNTIL = '2025-10-22', '2026-10-22'

class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines = []
    def handle_data(self, value):
        if value.strip():
            self.lines.append(value.strip())

def plain(value):
    parser = Text()
    parser.feed(value)
    return '\n'.join(parser.lines)

def fetch(url, data=None):
    request = urllib.request.Request(url, data=data, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode('utf-8')

def normalized(title):
    return re.sub(r'[^a-z0-9가-힣]', '', html.unescape(title).lower())

def collect(cache):
    cache.mkdir(parents=True, exist_ok=True)
    posts, page = [], 1
    while True:
        path = cache / f'wp-page-{page}.json'
        if not path.exists():
            params = urllib.parse.urlencode({'after':SINCE+'T00:00:00', 'before':'2026-10-23T00:00:00',
                'per_page':100,'page':page,'orderby':'date','order':'desc',
                '_fields':'id,date,date_gmt,link,title,content,categories,tags'})
            path.write_text(fetch('https://inside.lgensol.com/wp-json/wp/v2/posts?'+params), encoding='utf-8')
        batch = json.loads(path.read_text(encoding='utf-8'))
        posts.extend(dict(id=p['id'],date=p['date'][:10],url=p['link'].rstrip('/'),
            title=html.unescape(p['title']['rendered']),text=plain(p['content']['rendered'])) for p in batch)
        if len(batch)<100:
            break
        page += 1
    listing = cache/'corporate-list.raw'
    if not listing.exists():
        form = {'listSiteCountryCode':'KR','listSiteLanguageCode':'KO','startRnum':1,'endRnum':100,
                'typeGbn':'','recentNewsroomSeq':'','keyword':''}
        listing.write_text(fetch('https://www.lgensol.com/company/company-newsroom/newsroomListAjax.ajax',
            urllib.parse.urlencode(form).encode()),encoding='utf-8')
    columns = {}
    for element in ET.fromstring(listing.read_text(encoding='utf-8'))[0]:
        columns.setdefault(element.tag, []).append(element.text)
    rows = [dict(zip(columns, values)) for values in zip(*columns.values())]
    assert rows[-1]['postFromDate'].replace('.','-') < SINCE, 'Increase listing limit to cover the full year'
    rows = [r for r in rows if SINCE<=r['postFromDate'].replace('.','-')<=UNTIL]
    def original(row):
        seq = row['newsroomSeq']
        url = 'https://www.lgensol.com/kr/company/newsroom-detail?seq='+seq
        path = cache/f'corporate-{seq}.html'
        if not path.exists():
            path.write_text(fetch(url),encoding='utf-8')
        source = path.read_text(encoding='utf-8')
        detail = source.split('<div class="news-detail">',1)[1]
        date = re.search(r'class="news-info"[\s\S]*?<span>(\d{4}\.\d{2}\.\d{2})</span>',detail)[1].replace('.','-')
        title = plain(re.search(r'class="news-detail-tit">([\s\S]*?)</span>',detail)[1])
        assert date == row['postFromDate'].replace('.','-')
        best = max(posts,key=lambda p:SequenceMatcher(None,normalized(p['title']),normalized(title)).ratio())
        score = SequenceMatcher(None,normalized(best['title']),normalized(title)).ratio()
        assert score>.8, (seq,title,score)
        return {'seq':seq,'url':url,'date':date,'title':title,'post_id':best['id'],
                'match_score':round(score,4),'text':plain(detail.split('news-detail-text',1)[1])}
    with ThreadPoolExecutor(max_workers=5) as pool:
        corporate = list(pool.map(original, rows))
    assert len({p['post_id'] for p in corporate})==len(corporate)
    result = {'since':SINCE,'until':UNTIL,'posts':posts,'corporate':corporate}
    (cache/'sources.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(posts)} official channel posts, {len(corporate)} matching corporate originals; dates checked.')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--cache',type=Path,required=True)
    collect(parser.parse_args().cache)
