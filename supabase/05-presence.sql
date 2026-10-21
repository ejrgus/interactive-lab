-- Ephemeral member nicknames only. No notes, email addresses, or presence history.
-- A private Presence channel is limited to authenticated accounts.
begin;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='newsroom_presence_read') then
    create policy newsroom_presence_read on realtime.messages for select to authenticated
      using ((select auth.uid()) is not null and (select realtime.topic())='newsroom:online' and extension='presence');
  end if;
  if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='newsroom_presence_track') then
    create policy newsroom_presence_track on realtime.messages for insert to authenticated
      with check ((select auth.uid()) is not null and (select realtime.topic())='newsroom:online' and extension='presence');
  end if;
end $$;
commit;
