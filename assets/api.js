import {API_BASE} from './config.js';
let currentSession,sessionPromise;
const cloud=Boolean(API_BASE),storageKey='winticket-session-v1';
function token(){return localStorage.getItem(storageKey)||'';}
async function request(url,{method='GET',body,csrf}={}){
 const headers={};if(body!==undefined)headers['Content-Type']='application/json';
 if(cloud){if(token())headers['X-Wint-Session']=token();}
 else if(csrf)headers['X-CSRF-Token']=csrf;
 const response=await fetch((cloud?API_BASE:'')+url,{method,headers,credentials:cloud?'omit':'same-origin',cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});
 let result;try{result=await response.json();}catch{throw new Error('서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');}
 if(!response.ok){const e=new Error(result.error||'요청을 처리하지 못했습니다.');e.status=response.status;throw e;}
 if(cloud&&result.token){localStorage.setItem(storageKey,result.token);delete result.token;}
 return result;
}
export async function session(refresh=false){
 if(!currentSession||refresh){if(!sessionPromise)sessionPromise=request('/api/session').then(s=>(currentSession=s)).finally(()=>sessionPromise=null);await sessionPromise;}
 return currentSession;
}
export async function api(url,{method='GET',body}={}){
 const s=method!=='GET'||url.includes('/reservations')?await session():currentSession;
 const result=await request(url,{method,body,csrf:s?.csrf});
 if(result.csrf||Object.hasOwn(result,'admin'))currentSession={...currentSession,...result};return result;
}
export async function catalog(){try{return{...await api('/api/shows'),offline:false};}catch{const r=await fetch('seed.json');if(!r.ok)throw new Error('공연 목록을 불러오지 못했습니다.');return{shows:(await r.json()).filter(s=>s.published),offline:true};}}
export function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
export const money=n=>Number(n).toLocaleString('ko-KR')+'원';
export function dateLabel(date){return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'}).format(new Date(date+'T12:00:00+09:00'));}
export function showLink(id){return 'performance.html?id='+encodeURIComponent(id);}
