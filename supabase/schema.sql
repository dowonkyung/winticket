-- Production gateway only. Browsers cannot call this RPC or read these tables.
create table public.wt_admins(username text primary key, password_hash text not null);
create table public.wt_sessions(token_hash text primary key, owner uuid not null, admin text, expires timestamptz not null);
create index wt_sessions_expiry on public.wt_sessions(expires);
create table public.wt_shows(id text primary key, data jsonb not null, version integer not null default 1, created timestamptz not null default now());
create table public.wt_reservations(id text primary key, owner uuid not null, show_id text not null references public.wt_shows(id), session_id text not null, grade_id text not null, quantity integer not null check(quantity between 1 and 10), amount integer not null check(amount>=0), status text not null check(status in ('requested','cancelled')), snapshot jsonb not null, created timestamptz not null default now());
create index wt_reservations_inventory on public.wt_reservations(show_id,session_id,grade_id) where status='requested';
create index wt_reservations_owner on public.wt_reservations(owner,created desc);
create table public.wt_login_limits(key text primary key, attempts integer not null, expires timestamptz not null);
alter table public.wt_admins enable row level security;
alter table public.wt_sessions enable row level security;
alter table public.wt_shows enable row level security;
alter table public.wt_reservations enable row level security;
alter table public.wt_login_limits enable row level security;
revoke all on public.wt_admins,public.wt_sessions,public.wt_shows,public.wt_reservations,public.wt_login_limits from anon,authenticated;
grant all on public.wt_admins,public.wt_sessions,public.wt_shows,public.wt_reservations,public.wt_login_limits to service_role;

create or replace function public.wt_gateway(p_route text,p_method text,p_token text,p_new_token text,p_body jsonb,p_ip text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 s public.wt_sessions%rowtype; sh public.wt_shows%rowtype; r public.wt_reservations%rowtype;
 v jsonb; result jsonb; availability jsonb; a jsonb; g jsonb; se jsonb; oldse jsonb; held bigint; qty integer; rid text; sid text; gid text; n integer; lim integer;
begin
 select * into s from public.wt_sessions where token_hash=p_token and expires>now();
 if p_route='/api/session' and p_method='GET' then
  if s.token_hash is null then
   delete from public.wt_sessions where expires<now();
   insert into public.wt_sessions values(p_new_token,gen_random_uuid(),null,now()+interval '30 days') returning * into s;
  end if;
  return jsonb_build_object('admin',s.admin,'adminConfigured',exists(select 1 from public.wt_admins),'newSession',p_token is distinct from s.token_hash);
 end if;
 if p_route='/api/shows' and p_method='GET' then
  return jsonb_build_object('shows',coalesce((select jsonb_agg(data||jsonb_build_object('version',version) order by created desc,id) from public.wt_shows where (data->>'published')::boolean),'[]'::jsonb));
 end if;
 if p_route ~ '^/api/shows/[a-zA-Z0-9_-]+$' and p_method='GET' then
  select * into sh from public.wt_shows where id=split_part(p_route,'/',4);
  if sh.id is null or (not (sh.data->>'published')::boolean and s.admin is null) then return jsonb_build_object('error','공연을 찾을 수 없습니다.','status',404); end if;
  availability='{}';
  for se in select value from jsonb_array_elements(sh.data->'sessions') loop
   a='{}';
   for g in select value from jsonb_array_elements(sh.data->'grades') loop
    select coalesce(sum(quantity),0) into held from public.wt_reservations where show_id=sh.id and session_id=se->>'id' and grade_id=g->>'id' and status='requested';
    a=a||jsonb_build_object(g->>'id',(g->>'capacity')::integer-held);
   end loop;
   availability=availability||jsonb_build_object(se->>'id',a);
  end loop;
  return jsonb_build_object('show',sh.data||jsonb_build_object('version',sh.version),'availability',availability);
 end if;
 if s.token_hash is null then return jsonb_build_object('error','세션이 만료되었습니다. 새로고침해 주세요.','status',401); end if;
 if p_route='/api/admin/login' and p_method='POST' then
  insert into public.wt_login_limits values(p_ip,1,now()+interval '15 minutes') on conflict(key) do update set attempts=case when wt_login_limits.expires<now() then 1 else wt_login_limits.attempts+1 end,expires=case when wt_login_limits.expires<now() then now()+interval '15 minutes' else wt_login_limits.expires end returning attempts into lim;
  if lim>10 then return jsonb_build_object('error','로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.','status',429); end if;
  if not exists(select 1 from public.wt_admins where username=p_body->>'username' and password_hash=extensions.crypt(p_body->>'password',password_hash)) then return jsonb_build_object('error','아이디 또는 비밀번호를 확인해 주세요.','status',401); end if;
  delete from public.wt_login_limits where key=p_ip;
  delete from public.wt_sessions where token_hash=p_token;
  insert into public.wt_sessions values(p_new_token,s.owner,p_body->>'username',now()+interval '8 hours');
  return jsonb_build_object('admin',p_body->>'username','newSession',true);
 end if;
 if p_route='/api/admin/logout' and p_method='POST' then
  delete from public.wt_sessions where token_hash=p_token;
  insert into public.wt_sessions values(p_new_token,s.owner,null,now()+interval '30 days');
  return jsonb_build_object('admin',null,'newSession',true);
 end if;
 if p_route like '/api/admin/%' and s.admin is null then return jsonb_build_object('error','관리자 로그인이 필요합니다.','status',401); end if;
 if p_route='/api/admin/password' and p_method='POST' then
  if not exists(select 1 from public.wt_admins where username=s.admin and password_hash=extensions.crypt(p_body->>'currentPassword',password_hash)) then return jsonb_build_object('error','현재 비밀번호를 확인해 주세요.','status',401); end if;
  update public.wt_admins set password_hash=extensions.crypt(p_body->>'newPassword',extensions.gen_salt('bf',12)) where username=s.admin;
  delete from public.wt_sessions where admin=s.admin and token_hash<>s.token_hash;
  return jsonb_build_object('ok',true);
 end if;
 if p_route='/api/admin/uploads' and p_method='POST' then return jsonb_build_object('ok',true); end if;
 if p_route='/api/admin/shows' and p_method='GET' then return jsonb_build_object('shows',coalesce((select jsonb_agg(data||jsonb_build_object('version',version) order by created desc,id) from public.wt_shows),'[]'::jsonb)); end if;
 if p_route in ('/api/reservations','/api/admin/reservations') and p_method='GET' then
  return jsonb_build_object('reservations',coalesce((select jsonb_agg(to_jsonb(x) order by x.created desc) from (select id,quantity,amount,status,snapshot,created from public.wt_reservations where owner=s.owner or (p_route='/api/admin/reservations' and s.admin is not null) order by created desc limit 1000) x),'[]'::jsonb));
 end if;
 if p_route='/api/admin/shows' and p_method='POST' then
  insert into public.wt_shows(id,data) values(p_body->>'id',p_body) returning * into sh;
  return jsonb_build_object('show',sh.data||jsonb_build_object('version',sh.version));
 end if;
 if p_route ~ '^/api/admin/shows/[a-zA-Z0-9_-]+$' and p_method='PUT' then
  select * into sh from public.wt_shows where id=split_part(p_route,'/',5) for update;
  if sh.id is null then return jsonb_build_object('error','공연을 찾을 수 없습니다.','status',404); end if;
  if sh.version<>(p_body->>'version')::integer then return jsonb_build_object('error','다른 창에서 수정되었습니다. 최신 정보를 불러와 주세요.','status',409); end if;
  for result in select jsonb_build_object('sid',session_id,'gid',grade_id,'n',sum(quantity)) from public.wt_reservations where show_id=sh.id and status='requested' group by session_id,grade_id loop
   select value into se from jsonb_array_elements(p_body->'sessions') where value->>'id'=result->>'sid';
   select value into oldse from jsonb_array_elements(sh.data->'sessions') where value->>'id'=result->>'sid';
   select value into g from jsonb_array_elements(p_body->'grades') where value->>'id'=result->>'gid';
   if se is null or g is null or (g->>'capacity')::integer<(result->>'n')::integer or se->>'date'<>oldse->>'date' or se->>'time'<>oldse->>'time' then return jsonb_build_object('error','신청이 있는 회차·등급을 삭제하거나 일정을 변경할 수 없으며 수량을 신청 수보다 줄일 수 없습니다.','status',409); end if;
  end loop;
  v=p_body-'version';
  if sh.data ? 'legacyPoster' then v=v||jsonb_build_object('legacyPoster',sh.data->'legacyPoster'); end if;
  update public.wt_shows set data=v,version=version+1 where id=sh.id returning * into sh;
  return jsonb_build_object('show',sh.data||jsonb_build_object('version',sh.version));
 end if;
 if p_route='/api/reservations' and p_method='POST' then
  select * into sh from public.wt_shows where id=p_body->>'showId' for update;
  if sh.id is null then return jsonb_build_object('error','공연을 찾을 수 없습니다.','status',404); end if;
  qty=(p_body->>'quantity')::integer; sid=p_body->>'sessionId'; gid=p_body->>'gradeId';
  select value into se from jsonb_array_elements(sh.data->'sessions') where value->>'id'=sid;
  select value into g from jsonb_array_elements(sh.data->'grades') where value->>'id'=gid;
  if not (sh.data->>'published')::boolean or se is null or g is null or qty is null or qty<1 or qty>(sh.data->>'maxTickets')::integer then return jsonb_build_object('error','공연·회차·수량을 확인해 주세요.','status',400); end if;
  if nullif(sh.data->>'salesStart','') is not null and ((sh.data->>'salesStart')::timestamp at time zone 'Asia/Seoul')>now() then return jsonb_build_object('error','아직 예매 오픈 전입니다.','status',409); end if;
  if ((se->>'date'||'T'||(se->>'time'))::timestamp at time zone 'Asia/Seoul')<=now() then return jsonb_build_object('error','이미 시작된 공연 회차입니다.','status',409); end if;
  select coalesce(sum(quantity),0) into held from public.wt_reservations where owner=s.owner and show_id=sh.id and session_id=sid and status='requested';
  if held+qty>(sh.data->>'maxTickets')::integer then return jsonb_build_object('error','회차당 최대 신청 매수를 초과했습니다.','status',409); end if;
  select coalesce(sum(quantity),0) into held from public.wt_reservations where show_id=sh.id and session_id=sid and grade_id=gid and status='requested';
  if held+qty>(g->>'capacity')::integer then return jsonb_build_object('error','잔여 수량이 부족합니다.','status',409); end if;
  rid='WT-'||upper(replace(gen_random_uuid()::text,'-',''));
  v=jsonb_build_object('title',sh.data->'title','poster',sh.data->'poster','venue',sh.data->'venue','date',se->'date','time',se->'time','grade',g->'name','unitPrice',g->'price');
  insert into public.wt_reservations(id,owner,show_id,session_id,grade_id,quantity,amount,status,snapshot) values(rid,s.owner,sh.id,sid,gid,qty,(g->>'price')::integer*qty,'requested',v) returning * into r;
  return jsonb_build_object('reservation',jsonb_build_object('id',r.id,'quantity',r.quantity,'amount',r.amount,'status',r.status,'snapshot',r.snapshot),'message','예매 신청이 저장되었습니다. 결제 및 발권은 진행되지 않았습니다.');
 end if;
 if p_route ~ '^/api/reservations/WT-[A-F0-9]+/cancel$' and p_method='POST' then
  select * into r from public.wt_reservations where id=split_part(p_route,'/',4) for update;
  if r.id is null or (r.owner<>s.owner and s.admin is null) then return jsonb_build_object('error','신청 내역을 찾을 수 없습니다.','status',404); end if;
  if r.status<>'requested' then return jsonb_build_object('error','이미 취소된 신청입니다.','status',409); end if;
  update public.wt_reservations set status='cancelled' where id=r.id;
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error','요청 경로를 찾을 수 없습니다.','status',404);
end $$;
revoke all on function public.wt_gateway(text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.wt_gateway(text,text,text,text,jsonb,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('winticket','winticket',true,5242880,array['image/png','image/jpeg','image/webp']);
