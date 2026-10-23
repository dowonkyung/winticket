const fail=(status,message)=>Object.assign(new Error(message),{status});
const dateOK=s=>{const d=new Date(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===s;};
const timeOK=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
function string(v,max=1000){if(typeof v!=='string'||v.length>max)throw fail(400,'입력값의 형식 또는 길이를 확인해 주세요.');return v.trim();}
function integer(v,min,max){if(!Number.isInteger(v)||v<min||v>max)throw fail(400,'숫자 입력 범위를 확인해 주세요.');return v;}
function imagePath(v){v=string(v,1000);if(v&&!v.startsWith('https://ahchwkcszyphbmppctbt.supabase.co/storage/v1/object/public/winticket/')&&!/^(?:assets\/[a-zA-Z0-9_.@-]+\.(?:png|jpg|jpeg|webp)|\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp))$/.test(v))throw fail(400,'포스터와 상세 이미지는 파일 업로드를 사용해 주세요.');return v;}
export function validateShow(raw,id){
 const v={id,title:string(raw.title,200),category:string(raw.category,50),poster:imagePath(raw.poster),detailImage:imagePath(raw.detailImage||''),venue:string(raw.venue,200),address:string(raw.address||'',300),age:string(raw.age||'',100),duration:string(raw.duration||'',100),artist:string(raw.artist||'',300),organizer:string(raw.organizer||'',300),description:string(raw.description||'',20000),notice:string(raw.notice||'',20000),salesStart:string(raw.salesStart||'',16),maxTickets:integer(raw.maxTickets,1,10),published:raw.published===true,exclusive:raw.exclusive===true};
 if(!v.title||!v.category||!v.venue||!v.poster)throw fail(400,'공연명, 장르, 공연장, 포스터는 필수입니다.');
 if(v.salesStart&&(!dateOK(v.salesStart.slice(0,10))||v.salesStart[10]!=='T'||!timeOK(v.salesStart.slice(11))))throw fail(400,'예매 오픈 일시를 확인해 주세요.');
 if(!Array.isArray(raw.sessions)||raw.sessions.length>100||!Array.isArray(raw.grades)||raw.grades.length>20)throw fail(400,'회차 또는 좌석등급의 개수를 확인해 주세요.');
 v.sessions=raw.sessions.map(s=>{const date=string(s.date,10),time=string(s.time,5);if(!dateOK(date)||!timeOK(time))throw fail(400,'회차 날짜와 시간을 확인해 주세요.');return{id:string(s.id||crypto.randomUUID(),80),date,time};}).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 v.grades=raw.grades.map(g=>({id:string(g.id||crypto.randomUUID(),80),name:string(g.name,80),price:integer(g.price,0,10000000),capacity:integer(g.capacity,1,100000),color:/^#[a-f0-9]{6}$/i.test(g.color)?g.color:'#00cd3c'}));
 if(v.grades.some(g=>!g.name)||new Set(v.grades.map(g=>g.id)).size!==v.grades.length||new Set(v.sessions.map(s=>s.id)).size!==v.sessions.length||new Set(v.sessions.map(s=>s.date+s.time)).size!==v.sessions.length)throw fail(400,'좌석등급 이름 또는 중복된 회차를 확인해 주세요.');
 v.period=v.sessions.length?v.sessions[0].date.replaceAll('-','.')+' - '+v.sessions.at(-1).date.replaceAll('-','.'):'';
 return v;
}

