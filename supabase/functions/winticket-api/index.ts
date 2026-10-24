import {DOMParser,XMLSerializer} from 'npm:@xmldom/xmldom@0.9.12';
import {createClient} from 'npm:@supabase/supabase-js@2.95.3';
import {validateShow} from './validation.js';

const base=Deno.env.get('SUPABASE_URL')!;
const db=createClient(base,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set(['https://winticket.saevit.online','https://dowonkyung.github.io','http://127.0.0.1:4173','http://localhost:4173']);
const hex=(a:Uint8Array)=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');
const hash=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.has(origin)?origin:'https://winticket.saevit.online','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-wint-session','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
 const respond=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(origin&&!allowed.has(origin))return respond({error:'허용되지 않은 요청 출처입니다.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  const path=new URL(req.url).pathname.replace(/^.*\/winticket-api/,'');
  if(!path.startsWith('/api/')||!['GET','POST','PUT'].includes(req.method))return respond({error:'요청 경로를 찾을 수 없습니다.'},404);
  const rawToken=req.headers.get('x-wint-session')||'';
  if(rawToken&&!/^[a-f0-9]{64}$/.test(rawToken))return respond({error:'올바르지 않은 세션입니다.'},401);
  const fresh=hex(crypto.getRandomValues(new Uint8Array(32)));
  let body:any={};
  if(req.method!=='GET'){
   if(!req.headers.get('content-type')?.startsWith('application/json'))return respond({error:'JSON 요청만 지원합니다.'},415);
   // Read with a hard limit even when Content-Length is missing.
   const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
   if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>7500000){await reader.cancel();return respond({error:'업로드 파일이 너무 큽니다.'},413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return respond({error:'요청 데이터가 올바르지 않습니다.'},400);}
   if(!body||typeof body!=='object'||Array.isArray(body))return respond({error:'요청 데이터가 올바르지 않습니다.'},400);
  }
  if(path==='/api/admin/login'&&(typeof body.username!=='string'||body.username.length>64||typeof body.password!=='string'||new TextEncoder().encode(body.password).length>72))return respond({error:'아이디와 비밀번호를 확인해 주세요.'},400);
  if(path==='/api/admin/password'&&(!['currentPassword','newPassword'].every(k=>typeof body[k]==='string'&&new TextEncoder().encode(body[k]).length<=72)||body.newPassword.length<12))return respond({error:'새 비밀번호는 12자 이상, UTF-8 72바이트 이하로 입력해 주세요.'},400);
  if((path==='/api/admin/shows'&&req.method==='POST')||(/^\/api\/admin\/shows\/[a-zA-Z0-9_-]+$/.test(path)&&req.method==='PUT')){
   const version=body.version,id=req.method==='POST'?crypto.randomUUID():path.split('/').at(-1);
   body=validateShow(body,id,{Parser:DOMParser,Serializer:XMLSerializer});if(req.method==='PUT'){if(!Number.isInteger(version)||version<1)return respond({error:'공연 버전을 확인해 주세요.'},400);body.version=version;}
  }
  if(path==='/api/reservations'&&req.method==='POST'&&!Array.isArray(body.seatIds)&&(!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>10||!['showId','sessionId','gradeId'].every(k=>typeof body[k]==='string'&&body[k].length<=80)))return respond({error:'공연·회차·수량을 확인해 주세요.'},400);
  if(path==='/api/reservations'&&req.method==='POST'&&body.seatIds!==undefined&&(!Array.isArray(body.seatIds)||body.seatIds.length<1||body.seatIds.length>10||new Set(body.seatIds).size!==body.seatIds.length||!body.seatIds.every(s=>typeof s==='string'&&/^[-\w]{1,100}$/.test(s))||!['showId','sessionId'].every(k=>typeof body[k]==='string'&&body[k].length<=80)))return respond({error:'선택한 좌석 정보를 확인해 주세요.'},400);
  if(path==='/api/reservations'&&req.method==='POST'&&body.showVersion!==undefined&&(!Number.isInteger(body.showVersion)||body.showVersion<1))return respond({error:'공연 정보 버전을 확인해 주세요.'},400);
  let gatewayToken=rawToken?await hash(rawToken):'',member:any=null;
  const authorization=req.headers.get('authorization');
  if(authorization){
   if(!authorization.startsWith('Bearer ')||authorization.length>8192)return respond({error:'다시 로그인해 주세요.'},401);
   const jwt=authorization.slice(7);
   const {data:identity,error:identityError}=await db.auth.getUser(jwt);
   if(identityError||!identity.user)return respond({error:'로그인이 만료되었습니다. 다시 로그인해 주세요.'},401);
   let claims:any;try{const segment=jwt.split('.')[1].replaceAll('-','+').replaceAll('_','/');claims=JSON.parse(atob(segment));}catch{return respond({error:'다시 로그인해 주세요.'},401);}
   if(!/^[a-f0-9-]{36}$/.test(claims.session_id||'')||!Number.isFinite(claims.exp))return respond({error:'다시 로그인해 주세요.'},401);
   gatewayToken=await hash('member:'+jwt);
   const {data:profile,error:profileError}=await db.rpc('wt_member_session',{p_token:gatewayToken,p_user:identity.user.id,p_session:claims.session_id,p_expires:new Date(claims.exp*1000).toISOString()});
   if(profileError)return respond({error:'회원 정보를 확인하지 못했습니다.'},500);
   if(profile.error)return respond(profile,profile.status||401);
   member=profile;
   if(path.startsWith('/api/admin/'))return respond({error:'별도 관리자 계정으로 로그인해 주세요.'},403);
  }
  if(path==='/api/reservations'&&req.method==='POST'&&!member)return respond({error:'로그인 후 예매해 주세요.','loginRequired':true},401);
  const {data,error}=await db.rpc('wt_gateway',{p_route:path,p_method:req.method,p_token:gatewayToken,p_new_token:await hash(fresh),p_body:path==='/api/admin/uploads'?{}:body,p_ip:await hash(req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown')});
  if(error){console.error('gateway',error.code,error.message);return respond({error:'서버에서 요청을 처리하지 못했습니다.'},500);}
  if(data.error)return respond({error:data.error},data.status||400);
  if(path==='/api/admin/uploads'&&req.method==='POST'){
   if(typeof body.base64!=='string'||body.base64.length>7000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64))return respond({error:'이미지 파일을 확인해 주세요.'},400);
   const bytes=Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0));
   if(bytes.length>5*1024*1024)return respond({error:'이미지는 5MB 이하로 업로드해 주세요.'},413);
   const ext=hex(bytes.slice(0,8))==='89504e470d0a1a0a'?'png':hex(bytes.slice(0,3))==='ffd8ff'?'jpg':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'?'webp':null;
   if(!ext)return respond({error:'PNG, JPEG, WebP 이미지만 지원합니다.'},400);
   const name=crypto.randomUUID().replaceAll('-','')+'.'+ext;
   const {error:uploadError}=await db.storage.from('winticket').upload(name,bytes,{contentType:ext==='jpg'?'image/jpeg':'image/'+ext,upsert:false});
   if(uploadError){console.error('upload',uploadError.message);return respond({error:'이미지를 업로드하지 못했습니다.'},500);}
   return respond({url:base+'/storage/v1/object/public/winticket/'+name},201);
  }
  if(path==='/api/session')data.member=member;
  if(data.newSession){delete data.newSession;data.token=fresh;}
  else delete data.newSession;
  return respond(data,req.method==='POST'&&['/api/admin/shows','/api/reservations'].includes(path)?201:200);
 }catch(e){console.error('request',e.message);return respond({error:e.status?e.message:'서버에서 요청을 처리하지 못했습니다.'},e.status||500);}
});
