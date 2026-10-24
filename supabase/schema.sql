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

create table public.wt_reserved_seats(reservation_id text not null references public.wt_reservations(id) on delete cascade,show_id text not null references public.wt_shows(id),session_id text not null,seat_id text not null,grade_id text not null,active boolean not null default true,primary key(reservation_id,seat_id));
create unique index wt_seat_exclusivity on public.wt_reserved_seats(show_id,session_id,seat_id) where active;
create index wt_seat_grades on public.wt_reserved_seats(show_id,session_id,grade_id) where active;
alter table public.wt_reserved_seats enable row level security;
revoke all on public.wt_reserved_seats from anon,authenticated;
grant all on public.wt_reserved_seats to service_role;

create table public.wt_homepage(id integer primary key check(id=1), sections jsonb not null, version integer not null default 1);
alter table public.wt_homepage enable row level security;
revoke all on public.wt_homepage from public,anon,authenticated;
grant all on public.wt_homepage to service_role;
insert into public.wt_homepage values(1,'{"slider":null,"international":null,"upcoming":null,"weekly":null,"pick":null}',1);

create table public.wt_venues(id text primary key,data jsonb not null,version integer not null default 1,created timestamptz not null default now());
alter table public.wt_venues enable row level security;
revoke all on public.wt_venues from public,anon,authenticated;
grant all on public.wt_venues to service_role;
insert into public.wt_venues(id,data)
select id,jsonb_build_object('id',id,'name',name,'logo',logo,'address',address,'phone',phone,'website',website,'mapUrl',mapurl)
from (select gen_random_uuid()::text id, data->>'venue' name,coalesce(max(data->>'venueImage'),'') logo,coalesce(max(data->>'address'),'') address,coalesce(max(data->>'venuePhone'),'') phone,coalesce(max(data->>'venueWebsite'),'') website,coalesce(max(data->>'venueMapUrl'),'') mapurl from public.wt_shows where coalesce(data->>'venue','')<>'' group by data->>'venue') x;
update public.wt_shows h set data=h.data||jsonb_build_object('venueId',v.id),version=h.version+1 from public.wt_venues v where h.data->>'venue'=v.data->>'name';
create table public.wt_seat_templates(id text primary key,venue_id text not null references public.wt_venues(id),data jsonb not null,version integer not null default 1,created timestamptz not null default now());
create index wt_seat_templates_venue on public.wt_seat_templates(venue_id);
alter table public.wt_seat_templates enable row level security;
revoke all on public.wt_seat_templates from public,anon,authenticated;
grant all on public.wt_seat_templates to service_role;
CREATE OR REPLACE FUNCTION public.wt_gateway(p_route text, p_method text, p_token text, p_new_token text, p_body jsonb, p_ip text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 s public.wt_sessions%rowtype; sh public.wt_shows%rowtype; r public.wt_reservations%rowtype;
 v jsonb; chosen_seats jsonb; booked jsonb; selected_ids jsonb; total_amount integer; result jsonb; availability jsonb; a jsonb; g jsonb; se jsonb; oldse jsonb; held bigint; qty integer; rid text; sid text; gid text; n integer; lim integer;
begin
 select * into s from public.wt_sessions where token_hash=p_token and expires>now();
 if p_route='/api/session' and p_method='GET' then
  if s.token_hash is null then
   delete from public.wt_sessions where expires<now();
   insert into public.wt_sessions values(p_new_token,gen_random_uuid(),null,now()+interval '30 days') returning * into s;
  end if;
  return jsonb_build_object('admin',s.admin,'adminConfigured',exists(select 1 from public.wt_admins),'newSession',p_token is distinct from s.token_hash);
 end if;
 if p_route='/api/homepage' and p_method='GET' then
  select sections,version into v,n from public.wt_homepage where id=1;
  for sid in select jsonb_object_keys(v) loop
   if jsonb_typeof(v->sid)='array' then
    select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into a
    from jsonb_array_elements(v->sid) with ordinality x
    join public.wt_shows h on h.id=x.value#>>'{}' where (h.data->>'published')::boolean;
    v=jsonb_set(v,array[sid],a);
   end if;
  end loop;
  return jsonb_build_object('sections',v,'version',n);
 end if;
 if p_route='/api/shows' and p_method='GET' then
  return jsonb_build_object('shows',coalesce((select jsonb_agg((data-'seatMap')||jsonb_build_object('hasSeatMap',data->'seatMap' is not null and data->'seatMap'<>'null'::jsonb,'version',version) order by created desc,id) from public.wt_shows where (data->>'published')::boolean and data->>'deletedAt' is null),'[]'::jsonb),
  'retiredPosters',coalesce((select jsonb_agg(distinct p.value) from public.wt_shows h cross join lateral jsonb_array_elements(jsonb_build_array(h.data->'poster',h.data->'legacyPoster')) p where h.data->>'deletedAt' is not null and h.data->'deletedWasPublished'='true'::jsonb and p.value<>'null'::jsonb and not exists(select 1 from public.wt_shows active where (active.data->>'published')::boolean and (active.data->'poster'=p.value or active.data->'legacyPoster'=p.value))),'[]'::jsonb));
 end if;

 if p_route ~ '^/api/shows/[a-zA-Z0-9_-]+$' and p_method='GET' then
  select * into sh from public.wt_shows where id=split_part(p_route,'/',4);
  if sh.id is null or sh.data->>'deletedAt' is not null or (not (sh.data->>'published')::boolean and s.admin is null) then return jsonb_build_object('error','공연을 찾을 수 없습니다.','status',404); end if;
  availability='{}';
  for se in select value from jsonb_array_elements(sh.data->'sessions') loop
   a='{}';
   for g in select value from jsonb_array_elements(sh.data->'grades') loop
    select coalesce(sum(quantity),0) into held from public.wt_reservations where show_id=sh.id and session_id=se->>'id' and grade_id=g->>'id' and status='requested';
    select held+count(*) into held from public.wt_reserved_seats where show_id=sh.id and session_id=se->>'id' and grade_id=g->>'id' and active;
    a=a||jsonb_build_object(g->>'id',(g->>'capacity')::integer-held);
   end loop;
   availability=availability||jsonb_build_object(se->>'id',a);
  end loop;
  select coalesce(jsonb_object_agg(x.session_id,x.seats),'{}'::jsonb) into booked from (select session_id,jsonb_agg(seat_id) as seats from public.wt_reserved_seats where show_id=sh.id and active group by session_id) x;
  return jsonb_build_object('show',sh.data||jsonb_build_object('version',sh.version),'availability',availability,'occupied',booked);
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
 if p_route='/api/admin/homepage' and p_method='GET' then
  select sections,version into v,n from public.wt_homepage where id=1;
  return jsonb_build_object('sections',v,'version',n);
 end if;
 if p_route='/api/admin/homepage' and p_method='PUT' then
  v=p_body->'sections';
  if jsonb_typeof(v) is distinct from 'object' then return jsonb_build_object('error','영역 설정을 확인해 주세요.','status',400); end if;
  if (select count(*) from jsonb_object_keys(v))<>5 or not v ?& array['slider','international','upcoming','weekly','pick'] then return jsonb_build_object('error','다섯 영역을 모두 설정해 주세요.','status',400); end if;
  for sid in select jsonb_object_keys(v) loop
   if v->sid='null'::jsonb then continue; end if;
   if jsonb_typeof(v->sid)<>'array' then return jsonb_build_object('error','공연 목록을 확인해 주세요.','status',400); end if;
   lim=case sid when 'slider' then 20 when 'pick' then 40 else 5 end;
   if jsonb_array_length(v->sid)>lim then return jsonb_build_object('error','영역별 최대 공연 수를 초과했습니다.','status',400); end if;
   if exists(select 1 from jsonb_array_elements(v->sid) x where jsonb_typeof(x)<>'string' or not exists(select 1 from public.wt_shows h where h.id=x#>>'{}')) or (select count(distinct x) from jsonb_array_elements(v->sid) x)<>jsonb_array_length(v->sid) then return jsonb_build_object('error','중복되거나 존재하지 않는 공연입니다.','status',400); end if;
  end loop;
  if jsonb_typeof(p_body->'version') is distinct from 'number' or coalesce(p_body->>'version','') !~ '^[1-9][0-9]{0,8}$' then return jsonb_build_object('error','설정 버전을 확인해 주세요.','status',400); end if;
  select version into n from public.wt_homepage where id=1 for update;
  if n<>(p_body->>'version')::integer then return jsonb_build_object('error','다른 창에서 수정되었습니다. 저장된 설정을 다시 불러와 주세요.','status',409); end if;
  update public.wt_homepage set sections=v,version=version+1 where id=1 returning version into n;
  return jsonb_build_object('sections',v,'version',n);
 end if;
 if p_route='/api/admin/venues' and p_method='GET' then
  return jsonb_build_object('venues',coalesce((select jsonb_agg(data||jsonb_build_object('version',version) order by created desc,id) from public.wt_venues),'[]'::jsonb));
 end if;
 if p_route='/api/admin/venues' and p_method='POST' then
  insert into public.wt_venues(id,data) values(p_body->>'id',p_body);
  return jsonb_build_object('venue',p_body||jsonb_build_object('version',1));
 end if;
 if p_route ~ '^/api/admin/venues/[a-zA-Z0-9_-]+$' and p_method='PUT' then
  select data,version into a,n from public.wt_venues where id=split_part(p_route,'/',5) for update;
  if a is null then return jsonb_build_object('error','공연장을 찾을 수 없습니다.','status',404); end if;
  if n is distinct from (p_body->>'version')::integer then return jsonb_build_object('error','공연장 정보가 변경되었습니다. 다시 불러와 주세요.','status',409); end if;
  a=p_body-'version';
  update public.wt_venues set data=a,version=version+1 where id=a->>'id' returning version into n;
  update public.wt_shows set data=data||jsonb_build_object('venueId',a->'id','venue',a->'name','venueImage',a->'logo','address',a->'address','venuePhone',a->'phone','venueWebsite',a->'website','venueMapUrl',a->'mapUrl','venueLat','','venueLng',''),version=version+1 where data->>'venueId'=a->>'id';
  return jsonb_build_object('venue',a||jsonb_build_object('version',n));
 end if;
 if p_route ~ '^/api/admin/shows/[a-zA-Z0-9_-]+/(delete|restore)$' and p_method='POST' then
  select * into sh from public.wt_shows where id=split_part(p_route,'/',5) for update;
  if sh.id is null then return jsonb_build_object('error','공연을 찾을 수 없습니다.','status',404); end if;
  if jsonb_typeof(p_body->'version') is distinct from 'number' or coalesce(p_body->>'version','') !~ '^[1-9][0-9]{0,8}$' then return jsonb_build_object('error','공연 버전을 확인해 주세요.','status',400); end if;
  if sh.version<>(p_body->>'version')::integer then return jsonb_build_object('error','공연 정보가 변경되었습니다. 다시 불러와 주세요.','status',409); end if;
  if split_part(p_route,'/',6)='delete' then
   if sh.data->>'deletedAt' is not null then return jsonb_build_object('error','이미 삭제된 공연입니다.','status',409); end if;
   v=sh.data||jsonb_build_object('deletedAt',now(),'deletedWasPublished',sh.data->'published','published',false);
  else
   if sh.data->>'deletedAt' is null then return jsonb_build_object('error','삭제된 공연이 아닙니다.','status',409); end if;
   v=(sh.data-'deletedAt'-'deletedWasPublished')||jsonb_build_object('published',sh.data->'deletedWasPublished'='true'::jsonb);
  end if;
  update public.wt_shows set data=v,version=version+1 where id=sh.id returning * into sh;
  return jsonb_build_object('show',sh.data||jsonb_build_object('version',sh.version));
 end if;
 if ((p_route='/api/admin/shows' and p_method='POST') or (p_route ~ '^/api/admin/shows/[a-zA-Z0-9_-]+$' and p_method='PUT')) and coalesce(p_body->>'venueId','')<>'' then
  select data into a from public.wt_venues where id=p_body->>'venueId';
  if a is null then return jsonb_build_object('error','등록된 공연장을 선택해 주세요.','status',400); end if;
  p_body=p_body||jsonb_build_object('venueId',a->'id','venue',a->'name','venueImage',a->'logo','address',a->'address','venuePhone',a->'phone','venueWebsite',a->'website','venueMapUrl',a->'mapUrl','venueLat','','venueLng','');
 end if;
 if p_route='/api/admin/seat-templates' and p_method='GET' then
  return jsonb_build_object('templates',coalesce((select jsonb_agg((h.data-'seatMap')||jsonb_build_object('version',h.version,'zoneCount',jsonb_array_length(h.data->'seatMap'->'zones'),'seatCount',(select count(*) from jsonb_array_elements(h.data->'seatMap'->'zones') z cross join lateral jsonb_array_elements(z->'seats') st where st->'blocked'='false'::jsonb)) order by h.created desc,h.id) from public.wt_seat_templates h),'[]'::jsonb));
 end if;
 if p_route ~ '^/api/admin/seat-templates/[a-zA-Z0-9_-]+$' and p_method='GET' then
  select data,version into v,n from public.wt_seat_templates where id=split_part(p_route,'/',5);
  if v is null then return jsonb_build_object('error','구역도 양식을 찾을 수 없습니다.','status',404); end if;
  return jsonb_build_object('template',v||jsonb_build_object('version',n));
 end if;
 if p_route='/api/admin/seat-templates' and p_method='POST' then
  if not exists(select 1 from public.wt_venues where id=p_body->>'venueId') then return jsonb_build_object('error','등록된 공연장을 선택해 주세요.','status',400); end if;
  insert into public.wt_seat_templates(id,venue_id,data) values(p_body->>'id',p_body->>'venueId',p_body);
  return jsonb_build_object('template',p_body||jsonb_build_object('version',1));
 end if;
 if p_route ~ '^/api/admin/seat-templates/[a-zA-Z0-9_-]+$' and p_method='PUT' then
  select data,version into v,n from public.wt_seat_templates where id=split_part(p_route,'/',5) for update;
  if v is null then return jsonb_build_object('error','구역도 양식을 찾을 수 없습니다.','status',404); end if;
  if n is distinct from (p_body->>'version')::integer then return jsonb_build_object('error','구역도 양식이 변경되었습니다. 다시 불러와 주세요.','status',409); end if;
  if not exists(select 1 from public.wt_venues where id=p_body->>'venueId') then return jsonb_build_object('error','등록된 공연장을 선택해 주세요.','status',400); end if;
  v=p_body-'version';
  update public.wt_seat_templates set data=v,venue_id=v->>'venueId',version=version+1 where id=v->>'id' returning version into n;
  return jsonb_build_object('template',v||jsonb_build_object('version',n));
 end if;
 if p_route='/api/admin/password' and p_method='POST' then
  if not exists(select 1 from public.wt_admins where username=s.admin and password_hash=extensions.crypt(p_body->>'currentPassword',password_hash)) then return jsonb_build_object('error','현재 비밀번호를 확인해 주세요.','status',401); end if;
  update public.wt_admins set password_hash=extensions.crypt(p_body->>'newPassword',extensions.gen_salt('bf',12)) where username=s.admin;
  delete from public.wt_sessions where admin=s.admin and token_hash<>s.token_hash;
  return jsonb_build_object('ok',true);
 end if;
 if p_route='/api/admin/uploads' and p_method='POST' then return jsonb_build_object('ok',true); end if;
 if p_route='/api/admin/shows' and p_method='GET' then return jsonb_build_object('shows',coalesce((select jsonb_agg(data||jsonb_build_object('version',version) order by created desc,id) from public.wt_shows where data->>'deletedAt' is null),'[]'::jsonb),'deletedShows',coalesce((select jsonb_agg(data||jsonb_build_object('version',version) order by data->>'deletedAt' desc,id) from public.wt_shows where data->>'deletedAt' is not null),'[]'::jsonb)); end if;
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
  if sh.data->>'deletedAt' is not null then return jsonb_build_object('error','삭제된 공연은 복원 후 수정해 주세요.','status',409); end if;
  if sh.version<>(p_body->>'version')::integer then return jsonb_build_object('error','다른 창에서 수정되었습니다. 최신 정보를 불러와 주세요.','status',409); end if;
  if coalesce(sh.data->'seatMap','null'::jsonb) is distinct from coalesce(p_body->'seatMap','null'::jsonb) and exists(select 1 from public.wt_reservations where show_id=sh.id and status='requested') then return jsonb_build_object('error','신청이 남아 있는 공연의 좌석도·배치는 변경할 수 없습니다. 먼저 기존 신청을 처리해 주세요.','status',409); end if;
  for result in select jsonb_build_object('sid',session_id,'gid',grade_id,'n',sum(quantity)) from public.wt_reservations where show_id=sh.id and status='requested' group by session_id,grade_id loop
   select value into se from jsonb_array_elements(p_body->'sessions') where value->>'id'=result->>'sid';
   select value into oldse from jsonb_array_elements(sh.data->'sessions') where value->>'id'=result->>'sid';
   select value into g from jsonb_array_elements(p_body->'grades') where value->>'id'=result->>'gid';
   if se is null or (result->>'gid'<>'__assigned__' and (g is null or (g->>'capacity')::integer<(result->>'n')::integer)) or se->>'date'<>oldse->>'date' or se->>'time'<>oldse->>'time' then return jsonb_build_object('error','신청이 있는 회차·등급을 삭제하거나 일정을 변경할 수 없으며 수량을 신청 수보다 줄일 수 없습니다.','status',409); end if;
  end loop;
  v=p_body-'version';
  if sh.data ? 'legacyPoster' then v=v||jsonb_build_object('legacyPoster',sh.data->'legacyPoster'); end if;
  update public.wt_shows set data=v,version=version+1 where id=sh.id returning * into sh;
  return jsonb_build_object('show',sh.data||jsonb_build_object('version',sh.version));
 end if;
 if p_route='/api/reservations' and p_method='POST' then
  select * into sh from public.wt_shows where id=p_body->>'showId' for update;
  if sh.id is null then return jsonb_build_object('error','공연을 찾을 수 없습니다.','status',404); end if;
  selected_ids=p_body->'seatIds';
  qty=case when sh.data->'seatMap' is not null and sh.data->'seatMap'<>'null'::jsonb then case when jsonb_typeof(selected_ids)='array' then jsonb_array_length(selected_ids) else 0 end else (p_body->>'quantity')::integer end; sid=p_body->>'sessionId'; gid=p_body->>'gradeId';
  select value into se from jsonb_array_elements(sh.data->'sessions') where value->>'id'=sid;
  select value into g from jsonb_array_elements(sh.data->'grades') where value->>'id'=gid;
  if not (sh.data->>'published')::boolean or se is null or ((sh.data->'seatMap' is null or sh.data->'seatMap'='null'::jsonb) and g is null) or qty is null or qty<1 or qty>(sh.data->>'maxTickets')::integer then return jsonb_build_object('error','공연·회차·수량을 확인해 주세요.','status',400); end if;
  if ((sh.data->'seatMap' is not null and sh.data->'seatMap'<>'null'::jsonb) or p_body ? 'showVersion') and (nullif(p_body->>'showVersion','')::integer is distinct from sh.version) then return jsonb_build_object('error','공연 정보가 변경되었습니다. 새로고침 후 일정과 좌석을 다시 선택해 주세요.','status',409); end if;
  if nullif(sh.data->>'salesStart','') is not null and ((sh.data->>'salesStart')::timestamp at time zone 'Asia/Seoul')>now() then return jsonb_build_object('error','아직 예매 오픈 전입니다.','status',409); end if;
  if ((se->>'date'||'T'||(se->>'time'))::timestamp at time zone 'Asia/Seoul')<=now() then return jsonb_build_object('error','이미 시작된 공연 회차입니다.','status',409); end if;
  select coalesce(sum(quantity),0) into held from public.wt_reservations where owner=s.owner and show_id=sh.id and session_id=sid and status='requested';
  if held+qty>(sh.data->>'maxTickets')::integer then return jsonb_build_object('error','회차당 최대 신청 매수를 초과했습니다.','status',409); end if;
  if sh.data->'seatMap' is not null and sh.data->'seatMap'<>'null'::jsonb then
   if (select count(distinct value) from jsonb_array_elements_text(selected_ids))<>qty then return jsonb_build_object('error','중복된 좌석을 선택할 수 없습니다.','status',400); end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',st.value->>'id','zoneName',z.value->>'name','row',(st.value->>'row')::integer,'number',st.value->>'number','gradeId',gr.value->>'id','grade',gr.value->>'name','unitPrice',(gr.value->>'price')::integer)),'[]'::jsonb),coalesce(sum((gr.value->>'price')::integer),0) into chosen_seats,total_amount
   from jsonb_array_elements(sh.data->'seatMap'->'zones') z
   cross join lateral jsonb_array_elements(z.value->'seats') st
   join lateral jsonb_array_elements(sh.data->'grades') gr on gr.value->>'id'=st.value->>'gradeId'
   where selected_ids ? (st.value->>'id') and not (st.value->>'blocked')::boolean;
   if jsonb_array_length(chosen_seats)<>qty then return jsonb_build_object('error','선택한 좌석이 변경되었거나 판매 제외 좌석입니다. 새로고침해 주세요.','status',409); end if;
   if exists(select 1 from public.wt_reserved_seats where show_id=sh.id and session_id=sid and active and selected_ids ? seat_id) then return jsonb_build_object('error','다른 방문자가 먼저 신청한 좌석이 있습니다. 새로고침해 다시 선택해 주세요.','status',409); end if;
   rid='WT-'||upper(replace(gen_random_uuid()::text,'-',''));
   v=jsonb_build_object('title',sh.data->'title','poster',sh.data->'poster','venue',sh.data->'venue','date',se->'date','time',se->'time','grade','지정좌석','seats',chosen_seats);
   insert into public.wt_reservations(id,owner,show_id,session_id,grade_id,quantity,amount,status,snapshot) values(rid,s.owner,sh.id,sid,'__assigned__',qty,total_amount,'requested',v) returning * into r;
   insert into public.wt_reserved_seats(reservation_id,show_id,session_id,seat_id,grade_id) select rid,sh.id,sid,value->>'id',value->>'gradeId' from jsonb_array_elements(chosen_seats);
   return jsonb_build_object('reservation',jsonb_build_object('id',r.id,'quantity',r.quantity,'amount',r.amount,'status',r.status,'snapshot',r.snapshot),'message','선택한 좌석의 예매 신청이 저장되었습니다. 결제 및 발권은 진행되지 않았습니다.');
  end if;
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
  update public.wt_reserved_seats set active=false where reservation_id=r.id;
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error','요청 경로를 찾을 수 없습니다.','status',404);
end $function$
;
revoke all on function public.wt_gateway(text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.wt_gateway(text,text,text,text,jsonb,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('winticket','winticket',true,5242880,array['image/png','image/jpeg','image/webp']);
