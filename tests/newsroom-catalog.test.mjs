import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {canonicalUrl,inCategory,topicId} from '../newsroom/model.js';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const catalog=JSON.parse(await read('newsroom/catalogs/hankook-tire.json'));

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
    await db.exec(`insert into public.newsroom_companies(id,name) values('existing-hankook','한국타이어');
      insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','owner@example.test');`);
    const first=catalog.articles[0];
    await db.query(`insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-article',$1,'existing title','existing-hankook','existing category')`,[first.url]);
    await db.exec(`insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-article','existing private text');`);
    const before=(await db.query('select * from public.newsroom_notes')).rows;
    const seed=await read('supabase/07-seed-company-news.sql');
    await db.exec(seed);await db.exec(seed);
    assert.equal((await db.query("select id from public.newsroom_companies where name='한국타이어'")).rows[0].id,'existing-hankook');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-hankook'")).rows[0].n,catalog.articles.length);
    assert.equal((await db.query('select id,title from public.newsroom_articles where url=$1',[first.url])).rows[0].id,'existing-article');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='hyundai-motor-group'")).rows[0].n,71);
    assert.deepEqual((await db.query('select * from public.newsroom_notes')).rows,before);
  }finally{await db.close();}
});
