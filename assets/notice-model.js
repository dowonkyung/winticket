const fail=message=>Object.assign(new Error(message),{status:400});
export function validateBookingNotice(raw){
 if(raw==null)return {enabled:false,title:'예매 안내',runs:[]};
 if(typeof raw!=='object'||Array.isArray(raw)||typeof raw.enabled!=='boolean'||typeof raw.title!=='string'||raw.title.length>60||!Array.isArray(raw.runs)||raw.runs.length>500)throw fail('예매 전 주의사항의 형식을 확인해 주세요.');
 let size=0;const runs=raw.runs.map(r=>{if(!r||typeof r!=='object'||typeof r.text!=='string'||r.text.length>20000||typeof r.bold!=='boolean'||!/^#[0-9a-f]{6}$/i.test(r.color))throw fail('주의사항의 문구·굵기·색상을 확인해 주세요.');size+=r.text.length;return {text:r.text,bold:r.bold,color:r.color.toLowerCase()};});
 if(size>20000)throw fail('주의사항은 20,000자 이하로 입력해 주세요.');
 if(raw.enabled&&!runs.some(r=>r.text.trim()))throw fail('주의사항을 표시하려면 내용을 입력해 주세요.');
 return {enabled:raw.enabled,title:raw.title.trim()||'예매 안내',runs};
}
export function renderNotice(target,notice){target.replaceChildren();for(const r of validateBookingNotice(notice).runs){const span=document.createElement('span');span.textContent=r.text;span.style.color=r.color;span.style.fontWeight=r.bold?'700':'400';target.append(span);}}
