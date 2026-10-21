import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const db=new PGlite();
await db.exec(`create role anon; create role authenticated;
  create schema auth; create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
await db.exec(`create schema realtime;create table realtime.messages(id integer,extension text);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('test.topic',true) $$;
  grant usage on schema realtime to authenticated,anon;grant select,insert on realtime.messages to authenticated,anon;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
  grant usage on schema storage to authenticated,anon;grant select,insert,delete on storage.objects to authenticated,anon;`);
const schema=await readFile(root+'/supabase/setup.sql','utf8');
await db.exec(schema);await db.exec(schema);
const initialArticleCount=(await db.query('select count(*)::int n from public.newsroom_articles')).rows[0].n;
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003';
await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6)',[A,'member-a@example.test',B,'member-b@example.test',C,'admin@example.test']);
let checks=0;
async function as(role,id,fn){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${role}`);return fn();}
async function fails(fn){await assert.rejects(fn);checks++;}
await as('anon',null,async()=>{
  await fails(()=>db.query('select * from public.newsroom_companies'));
  await fails(()=>db.query('select * from public.newsroom_articles'));
  await fails(()=>db.query('select * from public.newsroom_notes'));
  await fails(()=>db.query('select public.newsroom_is_admin()'));
});
await as('authenticated',A,async()=>{
  assert.equal((await db.query('select count(*)::int n from public.newsroom_articles where company_id=$1',['hyundai-motor-group'])).rows[0].n,71);checks++;
  await db.query("insert into public.newsroom_companies(id,name) values('kia','기아')");
  await fails(()=>db.query("insert into public.newsroom_companies(name,logo_url) values('fake','https://example.test/logo.png')"));
  assert.equal((await db.query("update public.newsroom_companies set logo_url='https://example.test/forged.png' where id='kia' returning id")).rows.length,0);checks++;
  await db.query("insert into public.newsroom_articles(id,url,title,company_id,is_official,category,topics) values('external','https://example.test/external','외부 뉴스','kia',false,'섀시',ARRAY['시험'])");
  const external=(await db.query("select company,category,topics from public.newsroom_articles where id='external'")).rows[0];
  assert.equal(external.company,'기아');assert.equal(external.category,'외부링크');assert.deepEqual(external.topics,[]);checks+=3;
  await fails(()=>db.query("insert into public.newsroom_articles(url,title,company_id,is_official,category) values('https://example.test/bad-category','잘못된 공식 분야','kia',true,'외부링크')"));
  await db.query('select public.newsroom_import_records($1::jsonb,$2::jsonb)',['{}',JSON.stringify([{id:'imported-external',title:'외부 뉴스 백업',url:'https://example.test/imported-external',company:'기아',company_id:'kia',is_official:false,category:'섀시'}])]);
  const importedLink=(await db.query("select company_id,is_official,category from public.newsroom_articles where id='imported-external'")).rows[0];
  assert.deepEqual(importedLink,{company_id:'kia',is_official:false,category:'외부링크'});checks++;
  assert.equal((await db.query('select count(*)::int n from public.newsroom_articles')).rows[0].n,initialArticleCount+2);checks++;
  assert.equal((await db.query('select public.newsroom_is_admin() a')).rows[0].a,false);checks++;
  await db.query("insert into public.newsroom_profiles(user_id,nickname) values($1,'A')",[A]);
  await db.query("insert into public.newsroom_notes(article_id,memo) values('topic:test','A private')");
  await fails(()=>db.query("insert into public.newsroom_notes(user_id,article_id,memo) values($1,'forged','forged')",[B]));
  await fails(()=>db.query('insert into newsroom_private.admins(user_id) values($1)',[A]));
  await fails(()=>db.query("insert into public.newsroom_articles(url,title,category,created_by) values('https://example.test/forged','fake','test',$1)",[B]));
  await fails(()=>db.query("insert into public.newsroom_articles(url,title,category) values('javascript:alert(1)','bad','test')"));
});
await as('authenticated',B,async()=>{
  assert.equal((await db.query('select * from public.newsroom_notes')).rows.length,0);checks++;
  await db.query("insert into public.newsroom_notes(article_id,memo) values('topic:test','B private')");
  assert.equal((await db.query('select memo from public.newsroom_notes')).rows[0].memo,'B private');checks++;
  assert.equal((await db.query("update public.newsroom_notes set memo='stolen' where user_id=$1 returning memo",[A])).rows.length,0);checks++;
  assert.equal((await db.query('select * from public.newsroom_profiles')).rows.length,0);checks++;
});
await db.exec('reset role');await db.query('insert into newsroom_private.admins(user_id) values($1)',[C]);
await as('authenticated',C,async()=>{
  assert.equal((await db.query("update public.newsroom_companies set logo_url='https://example.test/logo.png',newsroom_url='https://example.test/newsroom' where id='kia' returning id")).rows.length,1);checks++;
  assert.equal((await db.query('select public.newsroom_is_admin() a')).rows[0].a,true);checks++;
  assert.equal((await db.query('select * from public.newsroom_notes')).rows.length,2);checks++;
  assert.equal((await db.query("update public.newsroom_notes set memo='admin edit' where user_id=$1 returning memo",[A])).rows.length,0);checks++;
});
await as('authenticated',A,async()=>{
  await db.query("insert into public.newsroom_notes(article_id,read) values('empty-read-record',true)");
  await db.query('select public.newsroom_import_records($1::jsonb,$2::jsonb)',[JSON.stringify({'empty-read-record':{memo:'Existing local memo',updated:'2026-01-01T00:00:00Z'}}),'[]']);
  assert.equal((await db.query("select memo from public.newsroom_notes where article_id='empty-read-record'")).rows[0].memo,'Existing local memo');checks++;
  await db.query("update public.newsroom_notes set memo='',user_edited=true,updated_at=now() where article_id='empty-read-record'");
  await db.query('select public.newsroom_import_records($1::jsonb,$2::jsonb)',[JSON.stringify({'empty-read-record':{memo:'Should not replace a deliberate clear',updated:'2026-01-01T00:00:00Z'}}),'[]']);
  assert.equal((await db.query("select memo from public.newsroom_notes where article_id='empty-read-record'")).rows[0].memo,'');checks++;
  const r=await db.query("update public.newsroom_notes set memo='A revision 2' where article_id='topic:test' and revision=1 returning revision");
  assert.equal(Number(r.rows[0].revision),2);checks++;
  assert.equal((await db.query("update public.newsroom_notes set memo='stale' where article_id='topic:test' and revision=1 returning revision")).rows.length,0);checks++;
  const records={'topic:import':{memo:'Imported private',qa:'Q&A',takeaway:'one',updated:'2026-10-20T12:00:00Z',user_id:B}};
  const result=await db.query('select public.newsroom_import_records($1::jsonb,$2::jsonb) result',[JSON.stringify(records),'[]']);
  assert.equal(result.rows[0].result.imported,1);checks++;
  assert.equal((await db.query("select user_id from public.newsroom_notes where article_id='topic:import'")).rows[0].user_id,A);checks++;
  const again=await db.query('select public.newsroom_import_records($1::jsonb,$2::jsonb) result',[JSON.stringify(records),'[]']);
  assert.equal(again.rows[0].result.imported,0);checks++;
  records['topic:import'].updated='2026-10-21T12:00:00Z';records['topic:import'].memo='Newer import';
  await db.query('select public.newsroom_import_records($1::jsonb,$2::jsonb)',[JSON.stringify(records),'[]']);
  assert.equal((await db.query("select memo from public.newsroom_notes where article_id='topic:import'")).rows[0].memo,'Newer import');checks++;
  await db.query('select public.newsroom_import_records($1::jsonb,$2::jsonb)',[JSON.stringify({'topic:blank-date':{memo:'initial'}}),'[]']);checks++;
  await db.query('select public.newsroom_import_records($1::jsonb,$2::jsonb)',[JSON.stringify({'topic:blank-date':{memo:'should not overwrite'}}),'[]']);
  assert.equal((await db.query("select memo from public.newsroom_notes where article_id='topic:blank-date'")).rows[0].memo,'initial');checks++;
});
await as('authenticated',B,async()=>{
  assert.equal((await db.query("select count(*)::int n from public.newsroom_notes where article_id='topic:import'")).rows[0].n,0);checks++;
});
const imagePath=`${A}/original.png`;
await as('anon',null,async()=>{
  await fails(()=>db.query('select * from public.newsroom_note_images'));
  await db.query("select set_config('test.topic','newsroom:online',false)");
  await fails(()=>db.query("insert into realtime.messages values(1,'presence')"));
});
await as('authenticated',A,async()=>{
  await db.query("select set_config('test.topic','newsroom:online',false)");
  await db.query("insert into realtime.messages values(1,'presence')");checks++;
  await fails(()=>db.query("insert into realtime.messages values(2,'broadcast')"));
  await db.query("select set_config('test.topic','unrelated',false)");
  await fails(()=>db.query("insert into realtime.messages values(3,'presence')"));
  await db.query("insert into storage.objects(bucket_id,name) values('newsroom-note-images',$1)",[imagePath]);checks++;
  await db.query("insert into public.newsroom_note_images(article_id,note_key,object_path,file_name,mime_type,byte_size) values('topic:test','takeaway',$1,'original.png','image/png',1024)",[imagePath]);checks++;
  await fails(()=>db.query("insert into storage.objects(bucket_id,name) values('newsroom-note-images',$1)",[`${B}/forged.png`]));
  await fails(()=>db.query("insert into public.newsroom_note_images(user_id,article_id,note_key,object_path,file_name,mime_type,byte_size) values($1,'topic:test','takeaway',$2,'forged.png','image/png',1)",[B,`${B}/forged.png`]));
  await db.query('update public.newsroom_note_images set width_percent=50');checks++;
  await fails(()=>db.query('update public.newsroom_note_images set width_percent=101'));
  await fails(()=>db.query("update public.newsroom_note_images set object_path='replaced'"));
});
await as('authenticated',B,async()=>{
  assert.equal((await db.query('select * from public.newsroom_note_images')).rows.length,0);checks++;
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);checks++;
  assert.equal((await db.query('delete from public.newsroom_note_images returning id')).rows.length,0);checks++;
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);checks++;
});
await as('authenticated',C,async()=>{
  assert.equal((await db.query('select width_percent from public.newsroom_note_images')).rows[0].width_percent,50);checks++;
  assert.equal((await db.query('select * from storage.objects')).rows.length,1);checks++;
  assert.equal((await db.query('update public.newsroom_note_images set width_percent=100 returning id')).rows.length,0);checks++;
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);checks++;
});
console.log(`PASS: ${checks} PostgreSQL permission, import, revision, and idempotency checks.`);
await db.close();
