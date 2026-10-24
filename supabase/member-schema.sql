-- Run after schema.sql. No browser can mint gateway sessions directly.
create or replace function public.wt_validate_member()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.email is null or new.email !~* '^[a-z0-9][a-z0-9._-]{0,63}@naver\.com$' then
  raise exception 'Only naver.com email accounts are supported';
 end if;
 if coalesce(new.raw_user_meta_data->>'nickname','') !~ '^[가-힣A-Za-z0-9_]{2,16}$' then
  raise exception 'A valid nickname is required';
 end if;
 return new;
end $$;
revoke all on function public.wt_validate_member() from public,anon,authenticated;
create trigger wt_validate_member before insert or update of email,raw_user_meta_data on auth.users
for each row execute function public.wt_validate_member();


-- Internal Auth lookup: the service-role gateway supplies the identity verified by getUser.
-- Private schema, no browser grants; never trust client-provided user/session identifiers.
create schema if not exists winticket_private;
revoke all on schema winticket_private from public,anon,authenticated;
grant usage on schema winticket_private to service_role;
create or replace function winticket_private.member_identity(p_user uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users%rowtype;
begin
 select * into u from auth.users where id=p_user;
 if u.id is null or u.email_confirmed_at is null or u.email !~* '^[a-z0-9][a-z0-9._-]{0,63}@naver\.com$'
 or coalesce(u.raw_user_meta_data->>'nickname','') !~ '^[가-힣A-Za-z0-9_]{2,16}$'
 or u.deleted_at is not null or u.banned_until>now()
 or not exists(select 1 from auth.sessions where id=p_session and user_id=p_user) then
  return jsonb_build_object('error','이메일 인증을 완료한 계정으로 다시 로그인해 주세요.','status',401);
 end if;
 return jsonb_build_object('id',u.id,'email',u.email,'nickname',u.raw_user_meta_data->>'nickname');
end $$;
revoke all on function winticket_private.member_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function winticket_private.member_identity(uuid,uuid) to service_role;
create or replace function public.wt_member_session(p_token text,p_user uuid,p_session uuid,p_expires timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile jsonb;
begin
 profile=winticket_private.member_identity(p_user,p_session);
 if profile ? 'error' then return profile; end if;
 if p_expires<=now() or p_expires>now()+interval '70 minutes' or p_token !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('error','다시 로그인해 주세요.','status',401);
 end if;
 delete from public.wt_sessions where expires<now();
 insert into public.wt_sessions(token_hash,owner,admin,expires) values(p_token,p_user,null,p_expires)
 on conflict(token_hash) do update set owner=excluded.owner,admin=null,expires=excluded.expires;
 return profile;
end $$;
revoke all on function public.wt_member_session(text,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.wt_member_session(text,uuid,uuid,timestamptz) to service_role;
