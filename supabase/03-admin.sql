-- First sign up through the newsroom and verify your email.
-- Replace YOUR_EMAIL_HERE with your own registered email, then run in SQL Editor.
-- This role allows reading members' notes, not editing them.
do $$
declare owner_id uuid;
begin
  select id into owner_id from auth.users where lower(email) = lower('YOUR_EMAIL_HERE');
  if owner_id is null then raise exception '먼저 뉴스룸에 가입하고 YOUR_EMAIL_HERE를 가입 이메일로 바꿔주세요.'; end if;
  insert into newsroom_private.admins(user_id) values(owner_id) on conflict do nothing;
end;
$$;
