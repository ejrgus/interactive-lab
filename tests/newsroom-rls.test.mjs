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
const schema=await readFile(root+'/supabase/setup.sql','utf8');
await db.exec(schema);await db.exec(schema);
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003';
await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6)',[A,'member-a@example.test',B,'member-b@example.test',C,'admin@example.test']);
let checks=0;
async function as(role,id,fn){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${role}`);return fn();}
async function fails(fn){await assert.rejects(fn);checks++;}
await as('anon',null,async()=>{
  await fails(()=>db.query('select * from public.newsroom_articles'));
  await fails(()=>db.query('select * from public.newsroom_notes'));
  await fails(()=>db.query('select public.newsroom_is_admin()'));
});
await as('authenticated',A,async()=>{
  assert.equal((await db.query('select count(*)::int n from public.newsroom_articles')).rows[0].n,71);checks++;
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
  assert.equal((await db.query('select public.newsroom_is_admin() a')).rows[0].a,true);checks++;
  assert.equal((await db.query('select * from public.newsroom_notes')).rows.length,2);checks++;
  assert.equal((await db.query("update public.newsroom_notes set memo='admin edit' where user_id=$1 returning memo",[A])).rows.length,0);checks++;
});
await as('authenticated',A,async()=>{
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
console.log(`PASS: ${checks} PostgreSQL permission, import, revision, and idempotency checks.`);
await db.close();
