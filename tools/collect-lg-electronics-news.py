"""Cache LG Electronics' public newsroom listing and complete article content."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from html.parser import HTMLParser
import html
import json
from pathlib import Path
import re
import urllib.request

SINCE,UNTIL='2025-10-22','2026-10-22'
ENDPOINT='https://apiv2.lge.co.kr/displaysvc/ajax/v1/story/newsroom-list'

class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines=[]
        self.buffer=[]
    def flush(self):
        value=re.sub(r'\s+',' ',''.join(self.buffer)).strip()
        if value:self.lines.append(value)
        self.buffer=[]
    def handle_starttag(self,tag,attrs):
        if tag in ['p','div','li','h1','h2','h3','br']:self.flush()
    def handle_endtag(self,tag):
        if tag in ['p','div','li','h1','h2','h3']:self.flush()
    def handle_data(self,value):
        self.buffer.append(value)

def fetch(url):
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0',
        'Referer':'https://www.lge.co.kr/story/newsroom'})
    with urllib.request.urlopen(request,timeout=45) as response:
        return response.read().decode('utf-8')

def collect(cache):
    cache.mkdir(parents=True,exist_ok=True)
    posts=[]
    page=1
    while True:
        path=cache/f'page-{page}.json'
        if not path.exists():path.write_text(fetch(ENDPOINT+f'?page={page}&countPerPage=100'),encoding='utf-8')
        data=json.loads(path.read_text(encoding='utf-8'))['data']
        assert data['page']==page
        for row in data['list']:
            date=row['postDate'].replace('.','-')
            if not SINCE<=date<=UNTIL:continue
            body=row['newsContent']
            parser=Text();parser.feed(body);parser.flush()
            posts.append({'id':row['postId'],'title':html.unescape(row['newsTitleText']).strip(),
                'date':date,'url':'https://www.lge.co.kr/story/newsroom/'+row['postId'],
                'source_category':row['newsroomCategory'],'text':'\n'.join(parser.lines)})
        if not data['list'] or min(r['postDate'].replace('.','-') for r in data['list'])<SINCE:
            break
        if page>=data['totalPage']:break
        page+=1
    assert len({p['id'] for p in posts})==len(posts)
    result={'since':SINCE,'until':UNTIL,'pages_checked':page,'site_total':data['totalCount'],
        'oldest_boundary_date':data['list'][-1]['postDate'].replace('.','-'), 'posts':posts}
    (cache/'sources.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(posts)} originals within the year, {page} pages checked; oldest page reaches {result["oldest_boundary_date"]}.')

def verify(cache,ids):
    sources={p['id']:p for p in json.loads((cache/'sources.json').read_text(encoding='utf-8'))['posts']}
    class Metadata(HTMLParser):
        def __init__(self):super().__init__();self.values={}
        def handle_starttag(self,tag,attrs):
            a=dict(attrs)
            if tag=='meta':self.values[a.get('property',a.get('name',''))]=a.get('content','')
            if tag=='link' and a.get('rel')=='canonical':self.values['canonical']=a.get('href','')
    def check(article_id):
        original=sources[article_id]
        path=cache/f'original-{article_id}.html'
        if not path.exists():path.write_text(fetch(original['url']),encoding='utf-8')
        source=path.read_text(encoding='utf-8');meta=Metadata();meta.feed(source)
        assert meta.values['canonical']==original['url']
        assert meta.values['article:published_time'][:10]==original['date']
        title=re.search(r'<h1 class="title">(.*?)</h1>',source,re.S)
        assert title,article_id
        norm=lambda value:re.sub(r'\s+','',html.unescape(re.sub('<[^>]+>','',value)))
        assert norm(title[1])==norm(original['title']),article_id
        body=re.search(r'<article class="news-content articleCase newsCase">(.*?)</article>',source,re.S)
        assert body,article_id
        parser=Text();parser.feed(body[1]);parser.flush()
        text='\n'.join(parser.lines)
        assert len(text)>100,article_id
        # The public listing supplies full HTML, not a search-result excerpt.
        assert norm(original['text'])[:200] in norm(text),article_id
        return {'id':article_id,'url':original['url'],'date':original['date'],'title':html.unescape(title[1]),
                'body_characters':len(text),'verified':True}
    with ThreadPoolExecutor(max_workers=5) as pool:checks=list(pool.map(check,ids))
    (cache/'original-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Confirmed canonical URLs, titles, publication dates and complete content for {len(checks)} originals.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--verify-ids',type=Path)
    parser.add_argument('--verify-selection',type=Path)
    args=parser.parse_args();collect(args.cache)
    if args.verify_ids:verify(args.cache,json.loads(args.verify_ids.read_text(encoding='utf-8')))
    if args.verify_selection:
        with args.verify_selection.open(encoding='utf-8',newline='') as file:
            verify(args.cache,[r['source_id'] for r in csv.DictReader(file,delimiter='|')])
