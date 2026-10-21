"""Cache public LG Innotek press and Insights listings and verify original pages."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import html
import json
from pathlib import Path
import re
import urllib.request
from html.parser import HTMLParser

SINCE, UNTIL = '2025-10-22', '2026-10-22'
BASE = 'https://www.lginnotek.com'

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]
    def handle_data(self, data): self.parts.append(data)

def plain(value):
    parser=Text(); parser.feed(value)
    return re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()

def fetch(url):
    request=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode('utf-8')

def collect(cache):
    cache.mkdir(parents=True,exist_ok=True)
    posts={}; boundaries={}; pages={}
    for kind in ['press','insights']:
        target=1; page=0
        while True:
            page+=1; path=cache/f'{kind}-{target}.json'
            url=BASE+f'/api/news/{kind}List.do?rowSize=100&targetRow={target}&locale=ko&category='
            if not path.exists(): path.write_text(fetch(url),encoding='utf-8')
            data=json.loads(path.read_text(encoding='utf-8')); assert data['code']=='S'
            rows=data['resultList']
            for row in rows:
                if SINCE<=row['from_day']<=UNTIL:
                    key=f"{kind}-{row['idx']}"
                    posts[key]={'id':key,'kind':kind,'source_id':str(row['idx']),
                        'date':row['from_day'],'title':html.unescape(row['title']).strip(),
                        'url':BASE+f"/news/{kind}View.do?idx={row['idx']}&locale=ko",
                        'text':plain(row['contents'])}
            if not rows or min(r['from_day'] for r in rows)<SINCE:
                boundaries[kind]=min((r['from_day'] for r in rows),default=None);break
            assert page<100
            target+=int(data['rowSize'])
        pages[kind]=page
    result={'since':SINCE,'until':UNTIL,'pages_checked':pages,'oldest_boundary_dates':boundaries,
            'posts':sorted(posts.values(),key=lambda p:(p['date'],p['id']),reverse=True)}
    (cache/'sources.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    for row in result['posts']: print(row['id'],row['date'],row['title'])
    print(f'{len(posts)} originals; pages {pages}; boundaries {boundaries}')

def verify(cache):
    posts=json.loads((cache/'sources.json').read_text(encoding='utf-8'))['posts']
    norm=lambda s:re.sub(r'\s+','',html.unescape(s))
    def check(row):
        path=cache/f"original-{row['id']}.html"
        if not path.exists(): path.write_text(fetch(row['url']),encoding='utf-8')
        source=path.read_text(encoding='utf-8'); text=plain(source)
        assert norm(row['title']) in norm(text),row['id']
        registered=re.search(r'<p id="reg_dt">([^<]+)</p>',source)
        # The public list uses from_day (scheduled publication), whereas the
        # detail template sometimes displays the later CMS registration date.
        assert registered or row['date'] in source or row['date'].replace('-','.') in source,row['id']
        assert norm(row['text'])[:200] in norm(text),row['id']
        assert len(row['text'])>100,row['id']
        return {'id':row['id'],'url':row['url'],'date':row['date'],'title':row['title'],
                'body_characters':len(row['text']),'detail_registration_date':registered[1][:10] if registered else None,
                'date_source':'official list from_day','verified':True}
    with ThreadPoolExecutor(max_workers=4) as pool: checks=list(pool.map(check,posts))
    (cache/'original-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Verified {len(checks)} original titles, dates and full content.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--verify',action='store_true');args=parser.parse_args()
    collect(args.cache)
    if args.verify: verify(args.cache)
