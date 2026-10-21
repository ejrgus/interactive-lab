import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {canonicalUrl,inCategory,topicId,usesSeparateReader} from '../newsroom/model.js';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const catalog=JSON.parse(await read('newsroom/catalogs/hankook-tire.json'));
const lg=JSON.parse(await read('newsroom/catalogs/lg-energy-solution.json'));
const asml=JSON.parse(await read('newsroom/catalogs/asml.json'));
const lge=JSON.parse(await read('newsroom/catalogs/lg-electronics.json'));
const innotek=JSON.parse(await read('newsroom/catalogs/lg-innotek.json'));
const kia=JSON.parse(await read('newsroom/catalogs/kia.json'));

test('Kia covers the verified year and distinguishes fleet contracts from launch reservations',async()=>{
  const excluded=JSON.parse(await read('newsroom/catalogs/kia-exclusions.json')).excluded;
  assert.equal(kia.coverage.since,'2025-10-22');
  assert.equal(kia.coverage.until,'2026-10-22');
  assert.equal(kia.articles.length,38);
  assert.equal(kia.articles.length+excluded.length,125);
  assert.equal(kia.coverage.selected_originals_verified,38);
  assert.ok(kia.coverage.oldest_boundary_date<kia.coverage.since);
  assert.equal(new Set(kia.articles.map(a=>a.id)).size,38);
  assert.equal(new Set(kia.articles.map(a=>a.url)).size,38);
  const fields=new Set();
  for(const a of kia.articles){
    assert.ok(a.date>=kia.coverage.since&&a.date<=kia.coverage.until);
    assert.equal(canonicalUrl(a.url),a.url);
    assert.match(a.url,/^https:\/\/worldwide\.kia\.com\/ko\/newsroom-korea\/view\?id=\d+$/);
    assert.equal(new URL(a.url).searchParams.get('id'),a.source_post_id);
    assert.ok(a.is_official&&a.verified&&a.summary&&a.study.startsWith('공부 질문:'));
    assert.ok(!/그랜드 마스터|채용|사회공헌|광고 캠페인|월드컵|호주오픈|초록여행/.test(a.title));
    assert.equal(new Set([a.category,...a.topics]).size,1+a.topics.length);
    for(const f of [a.category,...a.topics])fields.add(f);
  }
  assert.equal(fields.size,19);
  assert.ok([...fields].every(f=>!/마케팅|영업|인사|사회공헌/.test(f)));
  assert.ok(excluded.every(a=>a.reason));
  assert.equal(kia.articles.filter(a=>inCategory(a,'공급 / 계약')).length,11);
  const postal=kia.articles.find(a=>a.source_post_id==='1560');
  for(const field of ['공급 / 계약','PBV / 특장','시험 / 품질검증','물류 / 플릿 운영'])assert.ok(inCategory(postal,field));
  for(const id of ['1493','1485','1486','1535'])assert.ok(!inCategory(kia.articles.find(a=>a.source_post_id===id),'공급 / 계약'));
  assert.equal(kia.articles.filter(a=>a.url===postal.url).length,1);
  assert.notEqual(topicId(kia.company.id,'공급 / 계약'),topicId(innotek.company.id,'공급 / 계약'));
});

test('LG Innotek accounts for its verified year, excludes conflicting data and shares contracts',async()=>{
  const excluded=JSON.parse(await read('newsroom/catalogs/lg-innotek-exclusions.json')).excluded;
  assert.equal(innotek.coverage.since,'2025-10-22');
  assert.equal(innotek.coverage.until,'2026-10-22');
  assert.equal(innotek.articles.length,28);
  assert.equal(innotek.articles.length+excluded.length,42);
  assert.equal(innotek.coverage.selected_originals_verified,28);
  for(const boundary of Object.values(innotek.coverage.oldest_boundary_dates))assert.ok(boundary<innotek.coverage.since);
  assert.equal(new Set(innotek.articles.map(a=>a.url)).size,28);
  assert.equal(new Set(innotek.articles.map(a=>a.id)).size,28);
  const used=new Set();
  for(const a of innotek.articles){
    assert.ok(a.date>=innotek.coverage.since&&a.date<=innotek.coverage.until);
    assert.equal(canonicalUrl(a.url),a.url);
    assert.match(a.url,/^https:\/\/www\.lginnotek\.com\/news\/(press|insights)View\.do\?idx=\d+&locale=ko$/);
    assert.ok(a.is_official&&a.verified&&a.summary&&a.study.startsWith('공부 질문:'));
    assert.ok(!/광고 공모전|인재 모십니다|사회공헌|은탑산업훈장/.test(a.title));
    assert.equal(new Set([a.category,...a.topics]).size,1+a.topics.length);
    for(const f of [a.category,...a.topics])used.add(f);
  }
  assert.equal(used.size,17);
  assert.ok([...used].every(f=>!/마케팅|영업|인사|사회공헌/.test(f)));
  assert.ok(excluded.some(a=>a.url.includes('idx=6596')&&a.reason.includes('불일치')));
  assert.ok(!innotek.articles.some(a=>a.source_post_id==='press-6596'));
  assert.equal(innotek.articles.filter(a=>inCategory(a,'공급 / 계약')).length,11);
  const glass=innotek.articles.find(a=>a.source_post_id==='press-6572');
  for(const f of ['공급 / 계약','유리기판','소재 / 표면처리','시험 / 품질검증'])assert.ok(inCategory(glass,f));
  assert.equal(innotek.articles.filter(a=>a.url===glass.url).length,1);
  assert.notEqual(topicId(innotek.company.id,'공급 / 계약'),topicId(lge.company.id,'공급 / 계약'));
});

test('LG Electronics uses the relocated official newsroom and verified one-year originals',async()=>{
  const exclusions=JSON.parse(await read('newsroom/catalogs/lg-electronics-exclusions.json')).excluded;
  assert.equal(lge.coverage.since,'2025-10-22');
  assert.equal(lge.coverage.until,'2026-10-22');
  assert.equal(lge.articles.length,120);
  assert.equal(lge.articles.length+exclusions.length,370);
  assert.equal(lge.coverage.selected_originals_verified,lge.articles.length);
  assert.ok(lge.coverage.oldest_boundary_date<lge.coverage.since);
  assert.equal(lge.company.newsroom_url,'https://www.lge.co.kr/story/newsroom');
  assert.equal(new Set(lge.articles.map(a=>a.id)).size,lge.articles.length);
  assert.equal(new Set(lge.articles.map(a=>a.url)).size,lge.articles.length);
  const fields=new Set();
  for(const a of lge.articles){
    assert.ok(a.date>=lge.coverage.since&&a.date<=lge.coverage.until);
    assert.equal(canonicalUrl(a.url),a.url);
    assert.match(a.url,/^https:\/\/www\.lge\.co\.kr\/story\/newsroom\/\d+$/);
    assert.equal(a.url.split('/').at(-1),a.source_post_id);
    assert.ok(a.is_official&&a.verified&&a.summary&&a.study);
    assert.ok(!/위클리|Vol\.|에이아이돌|임원인사|봉사단|기부|세일|프로모션|캠페인/.test(a.title));
    assert.equal(new Set([a.category,...a.topics]).size,1+a.topics.length);
    for(const f of [a.category,...a.topics])fields.add(f);
  }
  assert.equal(fields.size,20);
  assert.ok([...fields].every(f=>!/마케팅|영업|인사|사회공헌/.test(f)));
  assert.ok(exclusions.every(a=>a.reason));
});

test('LG Electronics shares contract identity across fields and includes body-confirmed supply cases',()=>{
  assert.equal(lge.articles.filter(a=>inCategory(a,'공급 / 계약')).length,35);
  const a=lge.articles.find(a=>a.source_post_id==='236209');
  for(const field of ['공급 / 계약','데이터센터 / 열관리','시험 / 품질보증'])assert.ok(inCategory(a,field));
  assert.equal(lge.articles.filter(row=>row.url===a.url).length,1);
  const hiddenSupply=lge.articles.find(a=>a.source_post_id==='233910');
  assert.equal(hiddenSupply.category,'공급 / 계약');
  assert.notEqual(topicId(lge.company.id,'공급 / 계약'),topicId(lg.company.id,'공급 / 계약'));
});

test('the separate reader is restricted to sites confirmed to reject embedding',()=>{
  assert.equal(usesSeparateReader('https://investor.asml.com/news-releases/news-release-details/example'),true);
  assert.equal(usesSeparateReader('https://www.investor.asml.com/news-releases/news-release-details/example'),true);
  assert.equal(usesSeparateReader('https://www.lginnotek.com/news/pressView.do?idx=6601&locale=ko'),true);
  assert.equal(usesSeparateReader('https://lginnotek.com/news/insightsView.do?idx=245&locale=ko'),true);
  assert.equal(usesSeparateReader('https://www.lginnotek.com.example.org/story'),false);
  for(const url of ['','not a URL','https://investor.asml.com.example.org/story','https://www.asml.com/en/company/stories/2026/machines-behind-machines','https://inside.lgensol.com/story','https://www.hyundaimotorgroup.com/ko/story/test'])assert.equal(usesSeparateReader(url),false);
});

test('ASML originals follow the year and account for the full verified discovery scope',async()=>{
  const excluded=JSON.parse(await read('newsroom/catalogs/asml-exclusions.json')).excluded;
  assert.equal(asml.coverage.since,'2025-10-22');
  assert.equal(asml.coverage.until,'2026-10-22');
  assert.equal(asml.articles.length,11);
  assert.equal(excluded.length,8);
  assert.equal(asml.articles.length+excluded.length,asml.coverage.listed);
  assert.equal(new Set(asml.articles.map(a=>a.id)).size,asml.articles.length);
  assert.equal(new Set(asml.articles.map(a=>a.url)).size,asml.articles.length);
  const usedFields=new Set();
  for(const a of asml.articles){
    assert.ok(a.date>=asml.coverage.since&&a.date<=asml.coverage.until);
    assert.equal(canonicalUrl(a.url),a.url);
    assert.ok(['investor.asml.com','www.asml.com'].includes(new URL(a.url).hostname));
    assert.ok(a.verified&&a.is_official&&a.summary&&a.study);
    assert.ok(!/AGM|appoints|Introducing Marco|opinion piece|book publication|Annual Reports/.test(a.title));
    assert.ok(!/마케팅|영업|인사|사회공헌/.test([a.category,...a.topics].join(' ')));
    assert.equal(new Set([a.category,...a.topics]).size,1+a.topics.length);
    for(const f of [a.category,...a.topics])usedFields.add(f);
  }
  assert.equal(usedFields.size,11);
  assert.ok(excluded.every(a=>a.reason));
  const source=await read('newsroom/assets/asml-source.svg');
  const logo=await read('newsroom/assets/asml.svg');
  assert.equal(source.match(/<path d="([^"]+)"/)[1],logo.match(/<path d="([^"]+)"/)[1]);
  assert.match(logo,/<svg[^>]+viewBox="0 0 108 30"/);
  assert.match(logo,/<use href="#logo"/); // Official file is a symbol sprite: an img needs an explicit use.
});

test('ASML partnerships appear in technical sections with one article identity',()=>{
  const contracts=asml.articles.filter(a=>inCategory(a,'공급 / 계약'));
  assert.equal(contracts.length,4);
  const intel=contracts.find(a=>a.source_key.startsWith('intel-foundry'));
  for(const f of ['공급 / 계약','노광 / High NA EUV','마스크 / 공정통합','시험 / 품질검증'])assert.ok(inCategory(intel,f));
  assert.equal(asml.articles.filter(a=>a.url===intel.url).length,1);
  assert.notEqual(topicId(asml.company.id,'공급 / 계약'),topicId(lg.company.id,'공급 / 계약'));
});

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
    await db.exec(`insert into public.newsroom_companies(id,name) values('existing-hankook','한국타이어'),('existing-lg','LG에너지솔루션'),('existing-asml','ASML'),('existing-lge','LG전자');
      insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','owner@example.test');`);
    const first=catalog.articles[0];
    await db.query(`insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-article',$1,'existing title','existing-hankook','existing category')`,[first.url]);
    await db.exec(`insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-article','existing private text');`);
    await db.query(`insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-lg-article',$1,'existing LG title','existing-lg','existing category')`,[lg.articles[0].url]);
    await db.exec(`insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-lg-article','existing LG private text');`);
    await db.query(`insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-asml-article',$1,'existing ASML title','existing-asml','existing category')`,[asml.articles[0].url]);
    await db.exec(`insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-asml-article','existing ASML private text');`);
    await db.query(`insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-lge-article',$1,'existing LGE title','existing-lge','existing category')`,[lge.articles[0].url]);
    await db.exec(`insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-lge-article','existing LGE private text');`);
    await db.exec("insert into public.newsroom_companies(id,name) values('existing-innotek','LG이노텍');");
    await db.query("insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-innotek-article',$1,'existing Innotek title','existing-innotek','existing category')",[innotek.articles[0].url]);
    await db.exec("insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-innotek-article','existing Innotek private text');");
    await db.exec("insert into public.newsroom_companies(id,name) values('existing-kia','기아');");
    await db.query("insert into public.newsroom_articles(id,url,title,company_id,category) values('existing-kia-article',$1,'existing Kia title','existing-kia','existing category')",[kia.articles[0].url]);
    await db.exec("insert into public.newsroom_notes(user_id,article_id,takeaway) values('00000000-0000-4000-8000-000000000001','existing-kia-article','existing Kia private text');");
    const before=(await db.query('select * from public.newsroom_notes')).rows;
    const seed=await read('supabase/07-seed-company-news.sql');
    await db.exec(seed);await db.exec(seed);
    assert.equal((await db.query("select id from public.newsroom_companies where name='한국타이어'")).rows[0].id,'existing-hankook');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-hankook'")).rows[0].n,catalog.articles.length);
    assert.equal((await db.query("select id from public.newsroom_companies where name='LG에너지솔루션'")).rows[0].id,'existing-lg');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-lg'")).rows[0].n,lg.articles.length);
    assert.equal((await db.query('select id from public.newsroom_articles where url=$1',[lg.articles[0].url])).rows[0].id,'existing-lg-article');
    assert.equal((await db.query("select id from public.newsroom_companies where name='ASML'")).rows[0].id,'existing-asml');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-asml'")).rows[0].n,asml.articles.length);
    assert.equal((await db.query('select id from public.newsroom_articles where url=$1',[asml.articles[0].url])).rows[0].id,'existing-asml-article');
    assert.equal((await db.query("select id from public.newsroom_companies where name='LG전자'")).rows[0].id,'existing-lge');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-lge'")).rows[0].n,lge.articles.length);
    assert.equal((await db.query('select id from public.newsroom_articles where url=$1',[lge.articles[0].url])).rows[0].id,'existing-lge-article');
    assert.equal((await db.query("select id from public.newsroom_companies where name='LG이노텍'")).rows[0].id,'existing-innotek');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-innotek'")).rows[0].n,28);
    assert.equal((await db.query('select id from public.newsroom_articles where url=$1',[innotek.articles[0].url])).rows[0].id,'existing-innotek-article');
    assert.equal((await db.query("select id from public.newsroom_companies where name='기아'")).rows[0].id,'existing-kia');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='existing-kia'")).rows[0].n,38);
    assert.equal((await db.query('select id from public.newsroom_articles where url=$1',[kia.articles[0].url])).rows[0].id,'existing-kia-article');
    assert.equal((await db.query('select id,title from public.newsroom_articles where url=$1',[first.url])).rows[0].id,'existing-article');
    assert.equal((await db.query("select count(*)::int n from public.newsroom_articles where company_id='hyundai-motor-group'")).rows[0].n,71);
    assert.deepEqual((await db.query('select * from public.newsroom_notes')).rows,before);
  }finally{await db.close();}
});
