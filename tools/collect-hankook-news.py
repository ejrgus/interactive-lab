"""Cache public Hankook newsroom listings and article bodies; never reads accounts."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.body = []
        self.title = []
        self.date = ''
        self.date_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id') == 'crawl-media-live-date':
            self.date = attrs.get('data-live-date', '')
        if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):
            self.stack.append((tag, attrs.get('class', '')))
        if tag in ('br','p','div','li') and any('gmd-container-desc' in c for _, c in self.stack):
            self.body.append('\n')

    def handle_endtag(self, tag):
        if tag in ('p','div','li') and any('gmd-container-desc' in c for _, c in self.stack):
            self.body.append('\n')
        for i in range(len(self.stack)-1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if any('gmd-header-title' in c for _, c in self.stack):
            self.title.append(data)
        if any('gmd-header-date' in c for _, c in self.stack):
            self.date_text.append(data)
        if any('gmd-container-desc' in c for _, c in self.stack) and not any(t in ('script','style') for t,_ in self.stack):
            self.body.append(data)

def request(url, data=None):
    for attempt in range(3):
        try:
            req = Request(url, data=urlencode(data).encode() if data is not None else None,
                          headers={'User-Agent':'Mozilla/5.0', **({'Content-Type':'application/x-www-form-urlencoded'} if data is not None else {})})
            with urlopen(req, timeout=30) as response:
                return response.read().decode('utf-8')
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--since', required=True)
    parser.add_argument('--until', required=True)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    listing_path = args.cache / 'recent-list.json'
    if listing_path.exists():
        listing = json.loads(listing_path.read_text(encoding='utf-8'))
    else:
        listing, start = [], 0
        while start < 10000:
            data = json.loads(request('https://www.hankooktire.com/wsvc/api/global/mediacenter/list', {
                'startNum':start,'siteCd':'kr-ko','url':'/content/hankooktire/kr/ko/company/media-list/media-detail',
                'btnType':'show' if start else 'tabContents','tabCode':'','caseTemp':''}))
            rows = data.get('data', [])
            if not rows:
                break
            for row in rows:
                row['date'] = '-'.join(x.strip().zfill(2) for x in row['DATE'].split('.'))
                if args.since <= row['date'] <= args.until:
                    listing.append(row)
            start += len(rows)
            if rows[-1]['date'] < args.since:
                break
            time.sleep(.15)
        listing_path.write_text(json.dumps(listing, ensure_ascii=False, indent=2), encoding='utf-8')
    listing = [r for r in listing if args.since <= r['date'] <= args.until]

    def fetch(row):
        article_id = re.search(r'media-detail\.(\d+)\.html', row['DETAIL_URL'])[1]
        path = args.cache / f'{article_id}.json'
        if path.exists():
            return
        url = 'https://www.hankooktire.com' + row['DETAIL_URL'].removeprefix('/content/hankooktire')
        html = request(url)
        article = ArticleParser()
        article.feed(html)
        visible_date = re.search(r'(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})', ''.join(article.date_text))
        if visible_date:
            article.date = '-'.join(x.zfill(2) for x in visible_date.groups())
        lines = [re.sub(r'\s+', ' ', line).strip() for line in ''.join(article.body).splitlines()]
        lines = [line for line in lines if line]
        title = ''.join(article.title).strip()
        if not title or not lines or not article.date:
            raise ValueError(f'Missing article body/title/date: {url}')
        path.write_text(json.dumps({'source_id':article_id,'url':url,'title':title,'date':article.date,'listing_date':row['date'],'lines':lines}, ensure_ascii=False, indent=2), encoding='utf-8')

    errors = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch, row):row for row in listing}
        for count, future in enumerate(as_completed(futures), 1):
            try:
                future.result()
            except Exception as error:
                errors.append({'url':futures[future]['DETAIL_URL'],'error':str(error)})
            if count % 40 == 0:
                print(f'Checked original bodies: {count}/{len(listing)}; errors: {len(errors)}', flush=True)
    (args.cache / 'errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Finished: {len(listing)} listings, {len(errors)} unavailable originals', flush=True)

if __name__ == '__main__':
    main()
