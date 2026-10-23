let currentSession;
export async function session(refresh=false){
 if(!currentSession||refresh){const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('저장 서버에 연결할 수 없습니다. 서버형 배포가 필요합니다.');currentSession=await r.json();}
 return currentSession;
}
export async function api(url,{method='GET',body}={}){
 const headers={};if(method!=='GET'){const s=await session();headers['Content-Type']='application/json';headers['X-CSRF-Token']=s.csrf;}
 const response=await fetch(url,{method,headers,credentials:'same-origin',cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});
 let result;try{result=await response.json();}catch{throw new Error('서버에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요.');}
 if(!response.ok){const e=new Error(result.error||'요청을 처리하지 못했습니다.');e.status=response.status;throw e;}
 if(result.csrf)currentSession={...currentSession,...result};return result;
}
export async function catalog(){try{return{...await api('/api/shows'),offline:false};}catch{const r=await fetch('seed.json');if(!r.ok)throw new Error('공연 목록을 불러오지 못했습니다.');return{shows:(await r.json()).filter(s=>s.published),offline:true};}}
export function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
export const money=n=>Number(n).toLocaleString('ko-KR')+'원';
export function dateLabel(date){return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'}).format(new Date(date+'T12:00:00+09:00'));}
export function showLink(id){return 'performance.html?id='+encodeURIComponent(id);}
