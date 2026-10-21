"""Cache Kia's public Korean newsroom and cross-check its full detail responses."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import html
import json
from pathlib import Path
import re
import urllib.request

BASE='https://worldwide.kia.com'
SINCE,UNTIL='2025-10-22','2026-10-22'

class Text(HTMLParser):
    def __init__(self):super().__init__();self.parts=[]
    def handle_data(self,value):self.parts.append(value)

def plain(value):
    parser=Text();parser.feed(value)
    return re.sub(r'\s+',' ',' '.join(parser.parts)).strip()

def fetch(url):
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(request,timeout=45) as response:return response.read().decode('utf-8')

def collect(cache):
    cache.mkdir(parents=True,exist_ok=True);posts=[];page=0;seen=set()
    while True:
        path=cache/f'newsroom-{page}.json'
        if not path.exists():path.write_text(fetch(BASE+f'/api/newsroom?p={page}&pageSize=100'),encoding='utf-8')
        data=json.loads(path.read_text(encoding='utf-8'));assert data['status']==200
        rows=data['data']['list'];assert data['data']['paging']['currentPage']==page
        for row in rows:
            if not SINCE<=row['publicatedAt']<=UNTIL:continue
            assert row['id'] not in seen;seen.add(row['id'])
            posts.append({'id':str(row['id']),'title':html.unescape(row['title']).strip(),
                'date':row['publicatedAt'],'url':BASE+f"/ko/newsroom-korea/view?id={row['id']}",
                'alternate_url':row['pageUrl'],'text':plain(row['content'])})
        if not rows or min(r['publicatedAt'] for r in rows)<SINCE:break
        page+=1;assert page<20
    def verify(row):
        path=cache/f"detail-{row['id']}.json"
        if not path.exists():path.write_text(fetch(BASE+'/api/newsroom/id/'+row['id']),encoding='utf-8')
        data=json.loads(path.read_text(encoding='utf-8'));assert data['status']==200
        detail=data['data']['present']
        assert str(detail['id'])==row['id']
        assert html.unescape(detail['title']).strip()==row['title']
        assert detail['publicatedAt']==row['date']
        assert plain(detail['content'])==row['text'] and len(row['text'])>100
        return {'id':row['id'],'url':row['url'],'date':row['date'],'body_characters':len(row['text']),'verified':True}
    with ThreadPoolExecutor(max_workers=4) as pool:checks=list(pool.map(verify,posts))
    result={'since':SINCE,'until':UNTIL,'pages_checked':page+1,
        'oldest_boundary_date':min(r['publicatedAt'] for r in rows),
        'site_total':data['data']['paging']['totalCount'],'posts':posts}
    for name,value in [('sources.json',result),('original-checks.json',checks)]:
        (cache/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Verified {len(posts)} full official articles; {page+1} list pages; boundary {result["oldest_boundary_date"]}.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    collect(parser.parse_args().cache)
