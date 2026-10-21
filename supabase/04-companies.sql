-- Add company workspaces without changing any personal note content or owner.
begin;
create table if not exists public.newsroom_companies (
  id text primary key default gen_random_uuid()::text check (char_length(id) between 1 and 80 and id !~ ':'),
  name text not null unique check (char_length(btrim(name)) between 1 and 100),
  newsroom_url text not null default '' check (newsroom_url = '' or (char_length(newsroom_url) <= 2000 and newsroom_url ~ '^https://[^/@[:space:]]+([/:?#]|$)' and newsroom_url !~ '^https://[^/]*@')),
  logo_url text not null default '' check (logo_url = '' or (char_length(logo_url) <= 2000 and logo_url ~ '^https://[^/@[:space:]]+([/:?#]|$)' and logo_url !~ '^https://[^/]*@')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.newsroom_companies enable row level security;
revoke all on public.newsroom_companies from public, anon, authenticated;
grant select, insert on public.newsroom_companies to authenticated;
grant update (newsroom_url,logo_url) on public.newsroom_companies to authenticated;
drop policy if exists companies_read on public.newsroom_companies;
create policy companies_read on public.newsroom_companies for select to authenticated using (true);
drop policy if exists companies_insert on public.newsroom_companies;
create policy companies_insert on public.newsroom_companies for insert to authenticated
  with check (created_by = (select auth.uid()) and ((newsroom_url = '' and logo_url = '') or (select public.newsroom_is_admin())));
drop policy if exists companies_update on public.newsroom_companies;
create policy companies_update on public.newsroom_companies for update to authenticated
  using ((select public.newsroom_is_admin())) with check ((select public.newsroom_is_admin()));

insert into public.newsroom_companies(id,name,newsroom_url,created_by)
values ('hyundai-motor-group','현대자동차그룹','https://www.hyundaimotorgroup.com/ko/newsroom',null)
on conflict do nothing;
insert into public.newsroom_companies(name,created_by)
select distinct btrim(company),null::uuid from public.newsroom_articles where btrim(company) <> '' on conflict do nothing;
alter table public.newsroom_articles add column if not exists company_id text references public.newsroom_companies(id);
alter table public.newsroom_articles add column if not exists is_official boolean not null default true;
update public.newsroom_articles a set company_id=c.id
from public.newsroom_companies c where a.company_id is null and c.name=coalesce(nullif(btrim(a.company),''),'현대자동차그룹');
alter table public.newsroom_articles alter column company_id set not null;
create index if not exists newsroom_articles_company on public.newsroom_articles(company_id,date desc);

-- The DB also enforces classification, even if a client supplies extra topics.
create or replace function newsroom_private.classify_article() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare company_name text;
begin
  if new.company_id is null then
    company_name := coalesce(nullif(btrim(new.company),''),'현대자동차그룹');
    select id into new.company_id from public.newsroom_companies where name=company_name;
    if new.company_id is null then
      insert into public.newsroom_companies(name) values(company_name) on conflict do nothing;
      select id into new.company_id from public.newsroom_companies where name=company_name;
    end if;
  end if;
  select name into new.company from public.newsroom_companies where id=new.company_id;
  if not new.is_official then new.category := '외부링크'; new.topics := '{}'; end if;
  if new.is_official and new.category = '외부링크' then raise exception 'Choose a field for official newsroom articles'; end if;
  return new;
end;
$$;
drop trigger if exists newsroom_article_classification on public.newsroom_articles;
create trigger newsroom_article_classification before insert or update on public.newsroom_articles
for each row execute function newsroom_private.classify_article();

-- Keep both company and official/external classification when importing backups.
create or replace function public.newsroom_import_records(records jsonb, custom_articles jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; imported integer := 0; changed integer; entry record;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if jsonb_typeof(records) <> 'object' or jsonb_typeof(custom_articles) <> 'array' then raise exception 'Invalid backup format'; end if;
  if (select count(*) from jsonb_object_keys(records)) > 2000 or jsonb_array_length(custom_articles) > 500 then raise exception 'Backup exceeds import limit'; end if;
  for item in select value from jsonb_array_elements(custom_articles) loop
    insert into public.newsroom_articles(id,url,title,company,company_id,is_official,category,date,summary,study,created_by)
    values(item->>'id',item->>'url',item->>'title',coalesce(item->>'company',''),
      (select id from public.newsroom_companies where id=item->>'company_id'),coalesce((item->>'is_official')::boolean,false),item->>'category',
      nullif(item->>'date','')::date,coalesce(item->>'summary',''),coalesce(item->>'study',''),auth.uid())
    on conflict do nothing;
  end loop;
  for entry in select key,value from jsonb_each(records) loop
    item := entry.value;
    insert into public.newsroom_notes(user_id,article_id,memo,qa,takeaway,origin,favorite,read,user_edited,updated_at)
    values(auth.uid(),entry.key,coalesce(item->>'memo',''),coalesce(item->>'qa',''),coalesce(item->>'takeaway',''),
      coalesce(item->>'origin',''),coalesce((item->>'favorite')::boolean,false),coalesce((item->>'read')::boolean,false),
      coalesce((item->>'userEdited')::boolean,false),coalesce(nullif(item->>'updated','')::timestamptz,now()))
    on conflict (user_id,article_id) do update set
      memo=excluded.memo,qa=excluded.qa,takeaway=excluded.takeaway,origin=excluded.origin,
      favorite=excluded.favorite,read=excluded.read,user_edited=excluded.user_edited,updated_at=excluded.updated_at
    where (not public.newsroom_notes.user_edited and public.newsroom_notes.memo='' and public.newsroom_notes.qa='' and public.newsroom_notes.takeaway='')
      or public.newsroom_notes.updated_at < coalesce(nullif(item->>'updated','')::timestamptz,'epoch'::timestamptz);
    get diagnostics changed = row_count;
    imported := imported + changed;
  end loop;
  return jsonb_build_object('imported',imported);
end;
$$;
revoke all on function public.newsroom_import_records(jsonb,jsonb) from public,anon;
grant execute on function public.newsroom_import_records(jsonb,jsonb) to authenticated;
commit;
