-- Private original files; resizing only changes display metadata.
begin;
create table if not exists public.newsroom_note_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_id text not null check (length(article_id) between 1 and 200),
  note_key text not null check (note_key in ('memo','qa','takeaway')),
  object_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  width_percent integer not null default 100 check (width_percent between 25 and 100),
  created_at timestamptz not null default now(),
  check (split_part(object_path,'/',1)=user_id::text)
);
create index if not exists newsroom_note_images_note on public.newsroom_note_images(user_id,article_id,note_key);
alter table public.newsroom_note_images enable row level security;
revoke all on public.newsroom_note_images from public,anon,authenticated;
grant select,delete on public.newsroom_note_images to authenticated;
grant insert(id,user_id,article_id,note_key,object_path,file_name,mime_type,byte_size,width_percent),update(width_percent) on public.newsroom_note_images to authenticated;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='newsroom_note_images' and policyname='note_images_read') then
    create policy note_images_read on public.newsroom_note_images for select to authenticated using (user_id=(select auth.uid()) or (select public.newsroom_is_admin()));
    create policy note_images_insert on public.newsroom_note_images for insert to authenticated with check (user_id=(select auth.uid()));
    create policy note_images_update on public.newsroom_note_images for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
    create policy note_images_delete on public.newsroom_note_images for delete to authenticated using (user_id=(select auth.uid()));
  end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('newsroom-note-images','newsroom-note-images',false,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='newsroom_images_read') then
    create policy newsroom_images_read on storage.objects for select to authenticated using (bucket_id='newsroom-note-images' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select public.newsroom_is_admin())));
    create policy newsroom_images_insert on storage.objects for insert to authenticated with check (bucket_id='newsroom-note-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
    create policy newsroom_images_delete on storage.objects for delete to authenticated using (bucket_id='newsroom-note-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
end $$;
commit;
