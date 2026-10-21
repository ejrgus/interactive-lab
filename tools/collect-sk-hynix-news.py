"""Cache official SK hynix text originals separately from media-library posts."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import html
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

SINCE,UNTIL='2025-10-22','2026-10-22'
BASE='https://news.skhynix.co.kr'
TEXT_CATEGORIES=[92,2267,2291,2292,86,87,88,89]

class Text(HTMLParser):
    def __init__(self):super().__init__();self.parts=[]
    def handle_data(self,value):self.parts.append(value)

def plain(value):
    parser=Text();parser.feed(value)
    return re.sub(r'\s+',' ',' '.join(parser.parts)).strip()

def fetch(url):
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(request,timeout=60) as response:return response.read().decode('utf-8'),dict(response.headers)

def query(page,inventory=False):
    values={'after':'2025-10-21T23:59:59','before':'2026-10-23T00:00:00',
        'per_page':100,'page':page,'orderby':'date','order':'desc',
        '_fields':'id,date,link,title,categories' if inventory else 'id,date,date_gmt,link,title,content,categories,tags'}
    if not inventory:values['categories']=','.join(map(str,TEXT_CATEGORIES))
    return BASE+'/wp-json/wp/v2/posts?'+urllib.parse.urlencode(values)

def collect(cache):
    cache.mkdir(parents=True,exist_ok=True)
    first,headers=fetch(query(1,True));(cache/'inventory-1.json').write_text(first,encoding='utf-8')
    page_count=int(next(v for k,v in headers.items() if k.lower()=='x-wp-totalpages'))
    def inventory_page(page):
        path=cache/f'inventory-{page}.json'
        if not path.exists():path.write_text(fetch(query(page,True))[0],encoding='utf-8')
        return json.loads(path.read_text(encoding='utf-8'))
    with ThreadPoolExecutor(max_workers=4) as pool:batches=list(pool.map(inventory_page,range(1,page_count+1)))
    inventory=[{'id':str(r['id']),'date':r['date'][:10],'url':r['link'].rstrip('/'),
        'title':plain(r['title']['rendered']),'categories':r['categories']} for batch in batches for r in batch]
    posts=[];page=1
    while True:
        path=cache/f'articles-{page}.json'
        if not path.exists():path.write_text(fetch(query(page))[0],encoding='utf-8')
        batch=json.loads(path.read_text(encoding='utf-8'))
        posts.extend({'id':str(r['id']),'title':plain(r['title']['rendered']),'date':r['date'][:10],
            'published_time':r['date'],'url':r['link'].rstrip('/'),'text':plain(r['content']['rendered']),
            'categories':r['categories']} for r in batch)
        if len(batch)<100:break
        page+=1;assert page<50
    assert len({r['id'] for r in posts})==len(posts)
    assert all(SINCE<=r['date']<=UNTIL for r in posts)
    text_ids={r['id'] for r in posts};assert text_ids<={r['id'] for r in inventory}
    outside=[r|{'reason':'정식 본문 분류 밖의 사진·영상·SNS·IR 등 미디어 게시물. 본문 기사와 별도 집계; 개별 미디어 내용은 수집하지 않음.'} for r in inventory if r['id'] not in text_ids]
    data={'since':SINCE,'until':UNTIL,'inventory_total':len(inventory),'inventory_pages':page_count,
        'text_pages':page,'text_categories':TEXT_CATEGORIES,'posts':posts}
    for name,value in [('sources.json',data),('media-exclusions.json',outside)]:
        (cache/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(inventory)} total posts; {len(posts)} text originals; {len(outside)} non-text-category posts.')

def verify(cache,selection):
    import csv
    sources={r['id']:r for r in json.loads((cache/'sources.json').read_text(encoding='utf-8'))['posts']}
    with selection.open(encoding='utf-8',newline='') as file:ids=[r['source_id'] for r in csv.DictReader(file,delimiter='|')]
    norm=lambda s:re.sub(r'\s+','',html.unescape(s))
    def check(article_id):
        row=sources[article_id];path=cache/f'original-{article_id}.html'
        if not path.exists():path.write_text(fetch(row['url'])[0],encoding='utf-8')
        source=path.read_text(encoding='utf-8')
        canonical=re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"',source)
        assert canonical and html.unescape(canonical[1]).rstrip('/')==row['url'],article_id
        published=re.search(r'property="article:published_time" content="([^"]+)"',source)
        assert published and published[1][:10]==row['date'],article_id
        title=re.search(r'<h1[^>]*>(.*?)</h1>',source,re.S)
        # Newsroom header may be the first h1; inspect all real page headings.
        headings=re.findall(r'<h[12][^>]*>(.*?)</h[12]>',source,re.S)
        assert any(norm(plain(h))==norm(row['title']) for h in headings),article_id
        assert norm(row['text'])[:160] in norm(plain(source)),article_id
        return {'id':article_id,'url':row['url'],'date':row['date'],'body_characters':len(row['text']),'verified':True}
    with ThreadPoolExecutor(max_workers=4) as pool:checks=list(pool.map(check,ids))
    (cache/'original-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Verified {len(checks)} full original pages, titles, publication dates and canonical URLs.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--verify-selection',type=Path);args=parser.parse_args()
    if args.verify_selection:verify(args.cache,args.verify_selection)
    else:collect(args.cache)
