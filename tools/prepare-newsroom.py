"""Build public article seed SQL. Personal notes are NEVER input to this script."""
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / 'newsroom/catalog.json').read_text(encoding='utf-8-sig'))
articles = []
for article in catalog['articles']:
    parts = urlsplit(article['url'])
    if parts.scheme not in ('http', 'https') or parts.username or parts.password:
        raise ValueError('Invalid public article URL')
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid')]
    articles.append({
        'id': article['id'], 'url': urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), '')).rstrip('/'),
        'title': article['title'], 'company': '현대자동차그룹', 'category': article['category'],
        'date': article.get('date'), 'topics': article.get('topics', []), 'tags': article.get('tags', []),
        'summary': article.get('summary', ''), 'study': article.get('study', '')
    })
assert len({a['id'] for a in articles}) == len(articles)
assert len({a['url'] for a in articles}) == len(articles)
payload = json.dumps(articles, ensure_ascii=False).replace("'", "''")
seed = """-- Public article metadata only. No personal notes or account details.
insert into public.newsroom_articles(id,url,title,company,category,date,topics,tags,summary,study,created_by)
select id,url,title,company,category,date,topics,tags,summary,study,null
from jsonb_to_recordset('%s'::jsonb)
as article(id text,url text,title text,company text,category text,date date,topics text[],tags text[],summary text,study text)
on conflict do nothing;
""" % payload
(ROOT / 'supabase/02-seed-news.sql').write_text(seed, encoding='utf-8')
schema = (ROOT / 'supabase/01-newsroom.sql').read_text(encoding='utf-8')
migration = (ROOT / 'supabase/04-companies.sql').read_text(encoding='utf-8')
extras = '\n'.join((ROOT / f'supabase/{name}').read_text(encoding='utf-8') for name in ['05-presence.sql','06-note-images.sql'])
(ROOT / 'supabase/setup.sql').write_text('-- Run this entire file in Supabase SQL Editor.\n' + schema + '\n' + seed + '\n' + migration + '\n' + extras, encoding='utf-8')
print(f'Prepared {len(articles)} shared articles. Personal notes excluded.')
