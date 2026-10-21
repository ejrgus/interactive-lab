-- Run once in Supabase SQL Editor, as the project owner. Safe to run again.
begin;
create schema if not exists newsroom_private;
revoke all on schema newsroom_private from public, anon, authenticated;
create table if not exists newsroom_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on newsroom_private.admins from public, anon, authenticated;
alter table newsroom_private.admins enable row level security;

create or replace function public.newsroom_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from newsroom_private.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.newsroom_is_admin() from public, anon;
grant execute on function public.newsroom_is_admin() to authenticated;

create table if not exists public.newsroom_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 40)
);
create table if not exists public.newsroom_articles (
  id text primary key default gen_random_uuid()::text check (char_length(id) between 1 and 200),
  url text not null unique check (char_length(url) <= 2000 and url ~ '^https?://[^/@[:space:]]+([/:?#]|$)' and url !~ '^https?://[^/]*@'),
  title text not null check (char_length(title) between 1 and 500),
  company text not null default '' check (char_length(company) <= 100),
  category text not null check (char_length(category) between 1 and 100),
  date date,
  topics text[] not null default '{}',
  tags text[] not null default '{}',
  summary text not null default '' check (char_length(summary) <= 5000),
  study text not null default '' check (char_length(study) <= 5000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.newsroom_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Text key also preserves topic:... notebooks and legacy article identifiers.
  article_id text not null check (char_length(article_id) between 1 and 200),
  memo text not null default '' check (char_length(memo) <= 200000),
  qa text not null default '' check (char_length(qa) <= 200000),
  takeaway text not null default '' check (char_length(takeaway) <= 200000),
  origin text not null default '' check (char_length(origin) <= 500),
  favorite boolean not null default false,
  read boolean not null default false,
  user_edited boolean not null default false,
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  primary key (user_id, article_id)
);
create index if not exists newsroom_notes_article on public.newsroom_notes(article_id);
create index if not exists newsroom_articles_date on public.newsroom_articles(date desc);
alter table public.newsroom_profiles enable row level security;
alter table public.newsroom_articles enable row level security;
alter table public.newsroom_notes enable row level security;

-- Explicit grants are needed when automatic Data API exposure was disabled.
revoke all on public.newsroom_profiles, public.newsroom_articles, public.newsroom_notes from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.newsroom_profiles to authenticated;
grant insert (user_id, nickname), update (nickname) on public.newsroom_profiles to authenticated;
grant select, insert on public.newsroom_articles to authenticated;
grant select, insert on public.newsroom_notes to authenticated;
grant update (memo, qa, takeaway, origin, favorite, read, user_edited, updated_at) on public.newsroom_notes to authenticated;

drop policy if exists profiles_read on public.newsroom_profiles;
create policy profiles_read on public.newsroom_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.newsroom_is_admin()));
drop policy if exists profiles_insert on public.newsroom_profiles;
create policy profiles_insert on public.newsroom_profiles for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists profiles_update on public.newsroom_profiles;
create policy profiles_update on public.newsroom_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists articles_read on public.newsroom_articles;
create policy articles_read on public.newsroom_articles for select to authenticated using (true);
drop policy if exists articles_insert on public.newsroom_articles;
create policy articles_insert on public.newsroom_articles for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists notes_read on public.newsroom_notes;
create policy notes_read on public.newsroom_notes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.newsroom_is_admin()));
drop policy if exists notes_insert on public.newsroom_notes;
create policy notes_insert on public.newsroom_notes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists notes_update on public.newsroom_notes;
create policy notes_update on public.newsroom_notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function newsroom_private.bump_note_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
drop trigger if exists newsroom_note_revision on public.newsroom_notes;
create trigger newsroom_note_revision before update on public.newsroom_notes
for each row execute function newsroom_private.bump_note_revision();

-- Import is transactional, runs with the caller's RLS, and never accepts an owner ID.
create or replace function public.newsroom_import_records(records jsonb, custom_articles jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; imported integer := 0; changed integer; entry record;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if jsonb_typeof(records) <> 'object' or jsonb_typeof(custom_articles) <> 'array' then
    raise exception 'Invalid backup format';
  end if;
  if (select count(*) from jsonb_object_keys(records)) > 2000 or jsonb_array_length(custom_articles) > 500 then
    raise exception 'Backup exceeds import limit';
  end if;
  for item in select value from jsonb_array_elements(custom_articles) loop
    insert into public.newsroom_articles(id,url,title,company,category,date,summary,study,created_by)
    values(item->>'id',item->>'url',item->>'title',coalesce(item->>'company',''),item->>'category',
      nullif(item->>'date','')::date,coalesce(item->>'summary',''),coalesce(item->>'study',''),auth.uid())
    on conflict do nothing;
  end loop;
  for entry in select key, value from jsonb_each(records) loop
    item := entry.value;
    insert into public.newsroom_notes(user_id,article_id,memo,qa,takeaway,origin,favorite,read,user_edited,updated_at)
    values(auth.uid(),entry.key,coalesce(item->>'memo',''),coalesce(item->>'qa',''),coalesce(item->>'takeaway',''),
      coalesce(item->>'origin',''),coalesce((item->>'favorite')::boolean,false),coalesce((item->>'read')::boolean,false),
      coalesce((item->>'userEdited')::boolean,false),coalesce(nullif(item->>'updated','')::timestamptz,now()))
    on conflict (user_id,article_id) do update set
      memo=excluded.memo,qa=excluded.qa,takeaway=excluded.takeaway,origin=excluded.origin,
      favorite=excluded.favorite,read=excluded.read,user_edited=excluded.user_edited,updated_at=excluded.updated_at
    where (not public.newsroom_notes.user_edited
           and public.newsroom_notes.memo = ''
           and public.newsroom_notes.qa = ''
           and public.newsroom_notes.takeaway = '')
       or public.newsroom_notes.updated_at < coalesce(nullif(item->>'updated','')::timestamptz,'epoch'::timestamptz);
    get diagnostics changed = row_count;
    imported := imported + changed;
  end loop;
  return jsonb_build_object('imported', imported);
end;
$$;
revoke all on function public.newsroom_import_records(jsonb,jsonb) from public, anon;
grant execute on function public.newsroom_import_records(jsonb,jsonb) to authenticated;
commit;
