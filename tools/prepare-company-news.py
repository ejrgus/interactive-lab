"""Generate additive company/article seeds. Company lookup by name preserves existing IDs."""
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ARTICLE_FIELDS = ('id','url','title','category','date','topics','tags','summary','study')

def quoted(value):
    return "'" + value.replace("'", "''") + "'"

def build_company_seed(catalog):
    company = catalog['company']
    articles = [{key:article[key] for key in ARTICLE_FIELDS} for article in catalog['articles']]
    assert len({a['id'] for a in articles}) == len(articles)
    assert len({a['url'] for a in articles}) == len(articles)
    for url in [company['newsroom_url'], company['logo_url'], *[a['url'] for a in articles]]:
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError('Expected a public HTTPS URL')
    values = ','.join(quoted(company[key]) for key in ('id','name','newsroom_url','logo_url'))
    name = quoted(company['name'])
    payload = quoted(json.dumps(articles,ensure_ascii=False))
    return f"""-- {company['name']}: public metadata only. No personal notes, roles, or policies are changed.
-- Existing company IDs and article IDs are preserved when the name/URL already exists.
insert into public.newsroom_companies(id,name,newsroom_url,logo_url,created_by)
values ({values},null)
on conflict (name) do update set newsroom_url=excluded.newsroom_url,logo_url=excluded.logo_url;
insert into public.newsroom_articles(id,url,title,company,company_id,is_official,category,date,topics,tags,summary,study,created_by)
select a.id,a.url,a.title,c.name,c.id,true,a.category,a.date,a.topics,a.tags,a.summary,a.study,null
from jsonb_to_recordset({payload}::jsonb)
as a(id text,url text,title text,category text,date date,topics text[],tags text[],summary text,study text)
cross join public.newsroom_companies c where c.name={name}
on conflict (url) do nothing;
"""

def build_all():
    catalogs = []
    for path in sorted((ROOT/'newsroom/catalogs').glob('*.json')):
        catalog = json.loads(path.read_text(encoding='utf-8'))
        if 'company' in catalog and 'articles' in catalog:
            catalogs.append(catalog)
    result = 'begin;\n' + '\n'.join(build_company_seed(c) for c in catalogs) + '\ncommit;\n'
    (ROOT/'supabase/07-seed-company-news.sql').write_text(result,encoding='utf-8')
    return result, sum(len(c['articles']) for c in catalogs)

if __name__ == '__main__':
    _, count = build_all()
    print(f'Prepared {count} additional public articles; personal notes excluded.')
