import {defaultHome,validateHome,publicHome} from './assets/homepage-model.js';
import {validateBookingNotice} from './assets/notice-model.js';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot=path.dirname(fileURLToPath(import.meta.url));
const hash=v=>createHash('sha256').update(v).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const dateOK=s=>{const d=new Date(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===s;};
const timeOK=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
function string(v,max=1000){if(typeof v!=='string'||v.length>max)throw fail(400,'입력값의 형식 또는 길이를 확인해 주세요.');return v.trim();}
function integer(v,min,max){if(!Number.isInteger(v)||v<min||v>max)throw fail(400,'숫자 입력 범위를 확인해 주세요.');return v;}
function imagePath(v){v=string(v,1000);if(v&&!/^(?:assets\/[a-zA-Z0-9_.@-]+\.(?:png|jpg|jpeg|webp)|\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp))$/.test(v))throw fail(400,'포스터와 상세 이미지는 파일 업로드를 사용해 주세요.');return v;}
function validateShow(raw,id){
 if(raw.seatMap)throw fail(400,'지정좌석은 Supabase 운영 모드에서 설정할 수 있습니다.');
 const v={id,title:string(raw.title,200),category:string(raw.category,50),poster:imagePath(raw.poster),detailImage:imagePath(raw.detailImage||''),venue:string(raw.venue,200),address:string(raw.address||'',300),age:string(raw.age||'',100),duration:string(raw.duration||'',100),artist:string(raw.artist||'',300),organizer:string(raw.organizer||'',300),description:string(raw.description||'',20000),notice:string(raw.notice||'',20000),salesStart:string(raw.salesStart||'',16),maxTickets:integer(raw.maxTickets,1,10),published:raw.published===true,exclusive:raw.exclusive===true};
 for(const name of ['noticeImage','noticeImage2','artistImage','venueImage'])v[name]=imagePath(raw[name]||'');
 v.bookingNotice=validateBookingNotice(raw.bookingNotice);v.dateView=raw.dateView==='calendar'?'calendar':'list';v.certifiedBooking=raw.certifiedBooking!==false;
 v.venuePhone=string(raw.venuePhone||'',80);v.venueWebsite=string(raw.venueWebsite||'',500);
 if(v.venueWebsite){let u;try{u=new URL(v.venueWebsite);}catch{throw fail(400,'공연장 홈페이지 URL을 확인해 주세요.');}if(u.protocol!=='https:'||u.username||u.password)throw fail(400,'공연장 홈페이지는 HTTPS 주소를 입력해 주세요.');}
 for(const [key,max] of [['venueLat',90],['venueLng',180]]){const value=raw[key];if(value===undefined||value===null||value==='')v[key]='';else{const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>max)throw fail(400,'공연장 지도 좌표를 확인해 주세요.');v[key]=String(n);}}
 if(!v.title||!v.category||!v.venue||!v.poster)throw fail(400,'공연명, 장르, 공연장, 포스터는 필수입니다.');
 if(v.salesStart&&(!dateOK(v.salesStart.slice(0,10))||v.salesStart[10]!=='T'||!timeOK(v.salesStart.slice(11))))throw fail(400,'예매 오픈 일시를 확인해 주세요.');
 if(!Array.isArray(raw.sessions)||raw.sessions.length>100||!Array.isArray(raw.grades)||raw.grades.length>20)throw fail(400,'회차 또는 좌석등급의 개수를 확인해 주세요.');
 v.sessions=raw.sessions.map(s=>{const date=string(s.date,10),time=string(s.time,5);if(!dateOK(date)||!timeOK(time))throw fail(400,'회차 날짜와 시간을 확인해 주세요.');return{id:string(s.id||randomUUID(),80),date,time};}).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 v.grades=raw.grades.map(g=>({id:string(g.id||randomUUID(),80),name:string(g.name,80),price:integer(g.price,0,10000000),capacity:integer(g.capacity,1,100000),color:/^#[a-f0-9]{6}$/i.test(g.color)?g.color:'#00cd3c'}));
 if(v.grades.some(g=>!g.name)||new Set(v.grades.map(g=>g.id)).size!==v.grades.length||new Set(v.sessions.map(s=>s.id)).size!==v.sessions.length||new Set(v.sessions.map(s=>s.date+s.time)).size!==v.sessions.length)throw fail(400,'좌석등급 이름 또는 중복된 회차를 확인해 주세요.');
 v.period=v.sessions.length?v.sessions[0].date.replaceAll('-','.')+' - '+v.sessions.at(-1).date.replaceAll('-','.'):'';
 return v;
}

export async function createApplication(options={}){
 const root=options.rootDirectory||projectRoot,data=path.resolve(options.dataDirectory||process.env.WINTICKET_DATA_DIR||path.join(root,'data'));
 await mkdir(path.join(data,'uploads'),{recursive:true});
 const db=new DatabaseSync(path.join(data,'winticket.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 db.exec(`CREATE TABLE IF NOT EXISTS admins(username TEXT PRIMARY KEY,salt TEXT NOT NULL,password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,csrf TEXT NOT NULL,admin TEXT,expires INTEGER NOT NULL,owner TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS shows(id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY,owner TEXT NOT NULL,show_id TEXT NOT NULL REFERENCES shows(id),session_id TEXT NOT NULL,grade_id TEXT NOT NULL,quantity INTEGER NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,snapshot TEXT NOT NULL,created TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS reservations_inventory ON reservations(show_id,session_id,grade_id,status);
 CREATE INDEX IF NOT EXISTS reservations_owner ON reservations(owner);`);
 if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='owner')){db.exec("ALTER TABLE sessions ADD COLUMN owner TEXT NOT NULL DEFAULT ''; UPDATE sessions SET owner=token WHERE owner='';");}
 db.exec("CREATE TABLE IF NOT EXISTS homepage(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1)");
 db.prepare('INSERT OR IGNORE INTO homepage(id,data) VALUES(1,?)').run(JSON.stringify(defaultHome()));
 const home=()=>{const r=db.prepare('SELECT * FROM homepage WHERE id=1').get();return {sections:JSON.parse(r.data),version:r.version};};
 if(!db.prepare('SELECT id FROM shows LIMIT 1').get()){
  const seed=JSON.parse(await readFile(path.join(root,'seed.json'),'utf8'));const insert=db.prepare('INSERT INTO shows(id,data) VALUES(?,?)');
  db.exec('BEGIN');try{for(const show of [...seed].reverse())insert.run(show.id,JSON.stringify(show));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }
 const username=options.adminUsername||process.env.WINTICKET_ADMIN_USERNAME,password=options.adminPassword||process.env.WINTICKET_ADMIN_PASSWORD;
 if(password&&username&&!db.prepare('SELECT username FROM admins LIMIT 1').get()){
  if(!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)||password.length<12)throw new Error('관리자 아이디는 3~64자 영문/숫자, 비밀번호는 12자 이상이어야 합니다.');
  const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO admins VALUES(?,?,?)').run(username,salt,scryptSync(password,salt,64).toString('hex'));
 }
 delete process.env.WINTICKET_ADMIN_PASSWORD;
 const configuredOrigin=options.origin||process.env.WINTICKET_ORIGIN||'';
 const secureCookie=configuredOrigin.startsWith('https://');
 const rates=new Map();
 const getShow=id=>{const row=db.prepare('SELECT * FROM shows WHERE id=?').get(id);if(!row)throw fail(404,'공연을 찾을 수 없습니다.');return{...JSON.parse(row.data),version:row.version};};
 const allShows=admin=>db.prepare('SELECT * FROM shows ORDER BY rowid DESC').all().map(r=>({...JSON.parse(r.data),version:r.version})).filter(s=>admin||s.published);
 const remaining=(id,sid,gid,capacity)=>capacity-Number(db.prepare("SELECT COALESCE(SUM(quantity),0) AS n FROM reservations WHERE show_id=? AND session_id=? AND grade_id=? AND status='requested'").get(id,sid,gid).n);
 const availability=show=>Object.fromEntries(show.sessions.map(s=>[s.id,Object.fromEntries(show.grades.map(g=>[g.id,remaining(show.id,s.id,g.id,g.capacity)]))]));
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const cookie=(res,t)=>res.setHeader('Set-Cookie',`wint_session=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secureCookie?'; Secure':''}`);
 const current=req=>{const t=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('wint_session='))?.slice(13);if(!t||!/^[a-f0-9]{64}$/.test(t))return null;return db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hash(t),Date.now())||null;};
 const newSession=(res,admin=null,owner=null)=>{const t=token(),csrf=token(),expires=Date.now()+(admin?8*3600000:30*86400000);owner=owner||hash(t);db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(hash(t),csrf,admin,expires,owner);cookie(res,t);return{token:hash(t),csrf,admin,expires,owner};};
 const requireAdmin=s=>{if(!s?.admin)throw fail(401,'관리자 로그인이 필요합니다.');};
 async function body(req,max=8*1024*1024){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'JSON 요청만 지원합니다.');let chunks=[],length=0;for await(const c of req){length+=c.length;if(length>max)throw fail(413,'업로드 파일이 너무 큽니다.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'요청 데이터가 올바르지 않습니다.');}}
 function mutate(req,s){
  const port=server.address()?.port,allowed=configuredOrigin?[configuredOrigin]:[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
  if(!allowed.includes(req.headers.origin))throw fail(403,'허용되지 않은 요청 출처입니다.');
  if(!s||req.headers['x-csrf-token']!==s.csrf)throw fail(403,'세션이 만료되었습니다. 페이지를 새로고침해 주세요.');
 }
 function protectInventory(previous,next){
  for(const r of db.prepare("SELECT session_id,grade_id,SUM(quantity) AS n FROM reservations WHERE show_id=? AND status='requested' GROUP BY session_id,grade_id").all(previous.id)){
   const grade=next.grades.find(g=>g.id===r.grade_id),session=next.sessions.find(s=>s.id===r.session_id),oldSession=previous.sessions.find(s=>s.id===r.session_id);
   if(!grade||!session||grade.capacity<Number(r.n)||oldSession.date!==session.date||oldSession.time!==session.time)throw fail(409,'신청이 있는 회차·좌석등급을 삭제하거나 일정을 바꿀 수 없으며, 수량은 신청 수보다 작게 줄일 수 없습니다.');
  }
 }
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon'};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://ahchwkcszyphbmppctbt.supabase.co; connect-src 'self' https://ahchwkcszyphbmppctbt.supabase.co; frame-src https://www.openstreetmap.org; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
   const url=new URL(req.url,'http://localhost'),route=url.pathname,method=req.method;
   if(method==='GET'&&route==='/healthz'){db.prepare('SELECT 1').get();return json(res,200,{ok:true});}
   if(route.startsWith('/api/')){
    const session=current(req);
    if(method==='GET'&&route==='/api/session'){
     db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const s=session||newSession(res);
     return json(res,200,{csrf:s.csrf,admin:s.admin||null,adminConfigured:!!db.prepare('SELECT username FROM admins LIMIT 1').get()});
    }
    if(method==='GET'&&route==='/api/homepage')return json(res,200,{...home(),sections:publicHome(home().sections,allShows(true))});
    if(method==='GET'&&route==='/api/admin/homepage'){requireAdmin(session);return json(res,200,home());}
    if(method==='GET'&&route==='/api/shows')return json(res,200,{shows:allShows(false)});
    const showMatch=route.match(/^\/api\/shows\/([a-zA-Z0-9_-]+)$/);
    if(method==='GET'&&showMatch){const show=getShow(showMatch[1]);if(!show.published&&!session?.admin)throw fail(404,'공연을 찾을 수 없습니다.');return json(res,200,{show,availability:availability(show)});}
    if(method==='GET'&&route==='/api/admin/shows'){requireAdmin(session);return json(res,200,{shows:allShows(true)});}
    if(method==='GET'&&route==='/api/reservations'){
     if(!session)return json(res,200,{reservations:[]});
     return json(res,200,{reservations:db.prepare('SELECT id,quantity,amount,status,snapshot,created FROM reservations WHERE owner=? ORDER BY created DESC').all(session.owner).map(r=>({...r,snapshot:JSON.parse(r.snapshot)}))});
    }
    if(method==='GET'&&route==='/api/admin/reservations'){
     requireAdmin(session);return json(res,200,{reservations:db.prepare('SELECT id,quantity,amount,status,snapshot,created FROM reservations ORDER BY created DESC LIMIT 1000').all().map(r=>({...r,snapshot:JSON.parse(r.snapshot)}))});
    }
    if(!['POST','PUT'].includes(method))throw fail(404,'요청 경로를 찾을 수 없습니다.');
    mutate(req,session);
    if(route==='/api/admin/login'&&method==='POST'){
     const v=await body(req,4096),name=string(v.username,64);if(typeof v.password!=='string'||v.password.length>256)throw fail(400,'비밀번호를 확인해 주세요.');const pw=v.password,key=req.socket.remoteAddress||'local';
     const rate=rates.get(key)||{count:0,until:Date.now()+900000};if(rate.until<Date.now()){rate.count=0;rate.until=Date.now()+900000;}rate.count++;rates.set(key,rate);if(rates.size>10000)rates.delete(rates.keys().next().value);if(rate.count>10)throw fail(429,'로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.');
     const admin=db.prepare('SELECT * FROM admins WHERE username=?').get(name),salt=admin?.salt||'invalid-login-salt',derived=scryptSync(pw,salt,64),expected=Buffer.from(admin?.password||'0'.repeat(128),'hex');
     if(!admin||!timingSafeEqual(derived,expected))throw fail(401,'아이디 또는 비밀번호를 확인해 주세요.');
     rates.delete(key);db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);const next=newSession(res,name,session.owner);return json(res,200,{csrf:next.csrf,admin:name});
    }
    if(route==='/api/admin/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);const next=newSession(res,null,session.owner);return json(res,200,{csrf:next.csrf,admin:null});}
    if(route==='/api/admin/uploads'&&method==='POST'){
     requireAdmin(session);const v=await body(req),encoded=string(v.base64,7500000);if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded))throw fail(400,'이미지 파일을 확인해 주세요.');const bytes=Buffer.from(encoded,'base64');if(bytes.length>5*1024*1024)throw fail(413,'이미지는 5MB 이하로 업로드해 주세요.');
     const ext=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'webp':null;
     if(!ext)throw fail(400,'PNG, JPEG, WebP 이미지만 지원합니다.');const name=randomBytes(16).toString('hex')+'.'+ext;await writeFile(path.join(data,'uploads',name),bytes,{flag:'wx'});return json(res,201,{url:'/uploads/'+name});
    }
    const editMatch=route.match(/^\/api\/admin\/shows\/([a-zA-Z0-9_-]+)$/);
    if(route==='/api/admin/homepage'&&method==='PUT'){
     requireAdmin(session);const p=await body(req),sections=validateHome(p.sections,allShows(true));
     if(!Number.isInteger(p.version)||p.version<1)throw fail(400,'설정 버전을 확인해 주세요.');
     const result=db.prepare('UPDATE homepage SET data=?,version=version+1 WHERE id=1 AND version=?').run(JSON.stringify(sections),p.version);
     if(!result.changes)throw fail(409,'다른 창에서 수정되었습니다. 저장된 설정을 다시 불러와 주세요.');
     return json(res,200,home());
    }
    if(route==='/api/admin/shows'&&method==='POST'){
     requireAdmin(session);const v=validateShow(await body(req,150000),randomUUID());db.prepare('INSERT INTO shows(id,data) VALUES(?,?)').run(v.id,JSON.stringify(v));return json(res,201,{show:{...v,version:1}});
    }
    if(editMatch&&method==='PUT'){
     requireAdmin(session);const raw=await body(req,150000),old=getShow(editMatch[1]);if(raw.version!==old.version)throw fail(409,'다른 창에서 수정되었습니다. 최신 정보를 불러온 뒤 다시 저장해 주세요.');const v=validateShow(raw,old.id);protectInventory(old,v);
     if(old.legacyPoster)v.legacyPoster=old.legacyPoster;const r=db.prepare('UPDATE shows SET data=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(v),old.id,old.version);if(!r.changes)throw fail(409,'공연 정보가 변경되었습니다.');return json(res,200,{show:{...v,version:old.version+1}});
    }
    if(route==='/api/reservations'&&method==='POST'){
     const v=await body(req,4096),show=getShow(string(v.showId,80)),quantity=integer(v.quantity,1,show.maxTickets),sid=string(v.sessionId,80),gid=string(v.gradeId,80),s=show.sessions.find(s=>s.id===sid),g=show.grades.find(g=>g.id===gid);
     if(!show.published||!s||!g)throw fail(400,'선택한 공연·회차·좌석등급을 확인해 주세요.');
     if(show.salesStart&&Date.parse(show.salesStart+':00+09:00')>Date.now())throw fail(409,'아직 예매 오픈 전입니다.');
     if(Date.parse(s.date+'T'+s.time+':00+09:00')<=Date.now())throw fail(409,'이미 시작된 공연 회차입니다.');
     db.exec('BEGIN IMMEDIATE');try{
      const held=Number(db.prepare("SELECT COALESCE(SUM(quantity),0) AS n FROM reservations WHERE owner=? AND show_id=? AND session_id=? AND status='requested'").get(session.owner,show.id,sid).n);
      if(held+quantity>show.maxTickets)throw fail(409,`회차당 최대 ${show.maxTickets}매까지 신청할 수 있습니다.`);
      if(remaining(show.id,sid,gid,g.capacity)<quantity)throw fail(409,'잔여 수량이 부족합니다. 다른 등급이나 회차를 선택해 주세요.');
      const id='WT-'+randomBytes(8).toString('hex').toUpperCase(),amount=g.price*quantity,snapshot={title:show.title,poster:show.poster,venue:show.venue,date:s.date,time:s.time,grade:g.name,unitPrice:g.price};
      db.prepare("INSERT INTO reservations VALUES(?,?,?,?,?,?,?,'requested',?,?)").run(id,session.owner,show.id,sid,gid,quantity,amount,JSON.stringify(snapshot),new Date().toISOString());db.exec('COMMIT');return json(res,201,{reservation:{id,quantity,amount,status:'requested',snapshot},message:'예매 신청이 저장되었습니다. 결제 및 발권은 진행되지 않았습니다.'});
     }catch(e){db.exec('ROLLBACK');throw e;}
    }
    const cancel=route.match(/^\/api\/reservations\/(WT-[A-F0-9]+)\/cancel$/);
    if(cancel&&method==='POST'){
     const r=db.prepare('SELECT owner,status FROM reservations WHERE id=?').get(cancel[1]);if(!r||(!session.admin&&r.owner!==session.owner))throw fail(404,'신청 내역을 찾을 수 없습니다.');if(r.status!=='requested')throw fail(409,'이미 취소된 신청입니다.');db.prepare("UPDATE reservations SET status='cancelled' WHERE id=? AND status='requested'").run(cancel[1]);return json(res,200,{ok:true});
    }
    throw fail(404,'요청 경로를 찾을 수 없습니다.');
   }
   if(!['GET','HEAD'].includes(method))throw fail(405,'허용되지 않은 요청입니다.');
   let file;
   const pages={'/':'index.html','/index.html':'index.html','/performance.html':'performance.html','/admin.html':'admin.html','/myticket.html':'myticket.html','/reservation.html':'reservation.html','/login.html':'login.html','/seed.json':'seed.json'};
   if(pages[route])file=path.join(root,pages[route]);
   else if(/^\/assets\/[a-zA-Z0-9_.@-]+$/.test(route))file=path.join(root,route.slice(1));
   else if(/^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(route))file=path.join(data,route.slice(1));
   else throw fail(404,'페이지를 찾을 수 없습니다.');
   const info=await stat(file);if(!info.isFile())throw fail(404,'파일을 찾을 수 없습니다.');
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':route.startsWith('/uploads/')?'public, max-age=31536000, immutable':'no-cache'});res.end(method==='HEAD'?undefined:await readFile(file));
  }catch(e){if(!res.headersSent)json(res,e.status||((e.code==='ENOENT')?404:500),{error:e.status?e.message:e.code==='ENOENT'?'파일을 찾을 수 없습니다.':'서버에서 요청을 처리하지 못했습니다.'});else res.end();}
 });
 return {server,db,close:()=>new Promise((resolve,reject)=>{server.close(e=>{db.close();e?reject(e):resolve();});})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApplication();const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
 app.server.listen(port,host,()=>console.log(`윈트티켓: http://${host==='0.0.0.0'?'localhost':host}:${port}`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit()));
}
