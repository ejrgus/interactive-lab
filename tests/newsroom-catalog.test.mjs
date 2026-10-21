import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {canonicalUrl,inCategory,topicId} from '../newsroom/model.js';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const catalog=JSON.parse(await read('newsroom/catalogs/hankook-tire.json'));
const lg=JSON.parse(await read('newsroom/catalogs/lg-energy-solution.json'));

test('LGES catalog covers the year, merges official channels, and records every exclusion',async()=>{
  const excluded=JSON.parse(await read('newsroom/catalogs/lg-energy-solution-exclusions.json')).excluded;
  assert.equal(lg.coverage.since,'2025-10-22');
  assert.equal(lg.coverage.until,'2026-10-22');
  assert.equal(lg.articles.length,105);
  assert.equal(lg.articles.length+excluded.length,lg.coverage.listed);
  assert.equal(lg.coverage.cross_channel_duplicates_merged,44);
  const urls=lg.articles.flatMap(a=>[a.url,...a.alternate_urls]);
  assert.equal(new Set(urls).size,urls.length);
  for(const a of lg.articles){
    assert.ok(a.date>=lg.coverage.since&&a.date<=lg.coverage.until);
    assert.equal(canonicalUrl(a.url),a.url);
    assert.ok(['www.lgensol.com','inside.lgensol.com'].includes(new URL(a.url).hostname));
    assert.ok(a.verified&&a.is_official&&a.summary&&a.study);
    assert.ok(!/임원인사|BTC in Chicago|사회공헌|HR 프로그램|배터리더스|지역인재 육성|발명왕/.test(a.title));
    assert.ok(!/마케팅|영업|인사|사회공헌/.test([a.category,...a.topics].join(' ')));
    assert.equal(new Set([a.category,...a.topics]).size,1+a.topics.length);
  }
  const interbattery=lg.articles.find(a=>a.id==='lgensol-47471');
  assert.equal(interbattery.date,'2026-03-02'); // Corporate original, rather than the March 3 cross-post.
  assert.equal(interbattery.channel_date,'2026-03-03');
  assert.ok(excluded.every(a=>a.reason));
});

test('LGES contracts and technical categories use one article and one note identity',()=>{
  const a=lg.articles.find(a=>a.id==='lgensol-49218');
  assert.equal(a.category,'공급 / 계약');
  for(const field of ['공급 / 계약','구매 / 공급망','양극재 / 원료'])assert.ok(inCategory(a,field));
  assert.equal(lg.articles.filter(a=>inCategory(a,'공급 / 계약')).length,13);
  assert.equal(lg.articles.filter(row=>row.url===a.url).length,1);
  assert.notEqual(topicId(lg.company.id,'공급 / 계약'),topicId(catalog.company.id,'공급 / 계약'));
});

test('Hankook catalog follows the final one-year scope and exclusions',()=>{
  assert.equal(catalog.coverage.since,'2025-10-22');
  assert.equal(catalog.coverage.until,'2026-10-22');
  assert.equal(catalog.articles.length,catalog.coverage.selected);
  assert.equal(catalog.coverage.selected+catalog.coverage.excluded,catalog.coverage.listed);
  assert.equal(new Set(catalog.articles.map(a=>a.url)).size,catalog.articles.length);
  assert.equal(new Set(catalog.articles.map(a=>a.id)).size,catalog.articles.length);
  for(const a of catalog.articles){
    assert.ok(a.date>=catalog.coverage.since&&a.date<=catalog.coverage.until);
    assert.equal(canonicalUrl(a.url),a.url);
    assert.equal(new URL(a.url).hostname,'www.hankooktire.com');
    assert.ok(a.verified&&a.is_official&&a.summary&&a.study);
    assert.ok(!/프로모션|헌혈|기부|봉사|신년 간담회|프로액티브 어워즈|브랜드 필름/.test(a.title));
    assert.ok(!/마케팅|영업|인사|사회공헌/.test([a.category,...a.topics].join(' ')));
    assert.equal(new Set([a.category,...a.topics]).size,1+a.topics.length);
  }
});

test('supply articles share one identity across contract and technical categories',()=>{
  const a=catalog.articles.find(a=>a.id==='hankook-633631');
  assert.equal(a.category,'공급 / 계약');
  for(const field of ['공급 / 계약','타이어 설계 / 성능','시험 / 성능검증','컴파운드 / 재료'])assert.ok(inCategory(a,field));
  assert.equal(catalog.articles.filter(row=>row.url===a.url).length,1);
  assert.notEqual(topicId(catalog.company.id,'품질'),topicId('hyundai-motor-group','품질'));
});

test('company seed reuses existing company/article IDs and leaves notes unchanged on repeat',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);
    for(const file of ['01-newsroom.sql','02-seed-news.sql','04-companies.sql'])await db.exec(await read('supabase/'+file));
    await db.exec(`insert into public.newsroom_companies(id,name) values('existing-hankook','한국타이어'),('existing-lg','LG에너지솔루션');
      insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','owner@example.test');`);
    const first=catalog.articles[0];
    await db.query(`insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-article',$1,'existing title','existing-hankook','existing category')`,[first.url]);
    await db.exec(`insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-article','existing private text');`);
    await db.query(`insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-lg-article',$1,'existing LG title','existing-lg','existing category')`,[lg.articles[0].url]);
    await db.exec(`insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-lg-article','existing LG private text');`);
    const before=(await db.query('select * from public.newsroom_notes')).rows;
    const seed=await read('supabase/07-seed-company-news.sql');
    await db.exec(seed);await db.exec(seed);
    assert.equal((await db.query("select id from public.newsroom_companies where name='한국타이어'")).rows[0].id,'existing-hankook');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-hankook'")).rows[0].n,catalog.articles.length);
    assert.equal((await db.query("select id from public.newsroom_companies where name='LG에너지솔루션'")).rows[0].id,'existing-lg');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-lg'")).rows[0].n,lg.articles.length);
    assert.equal((await db.query('select id from public.newsroom_articles where url=$1',[lg.articles[0].url])).rows[0].id,'existing-lg-article');
    assert.equal((await db.query('select id,title from public.newsroom_articles where url=$1',[first.url])).rows[0].id,'existing-article');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='hyundai-motor-group'")).rows[0].n,71);
    assert.deepEqual((await db.query('select * from public.newsroom_notes')).rows,before);
  }finally{await db.close();}
});
