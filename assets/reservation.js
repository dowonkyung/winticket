import {api,session,el,money,dateLabel} from './api.js?v=seats-1';
import {mapElement,bindZones,flattenSeats,seatLabel} from './seat-model.js?v=seats-1';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search),id=params.get('id');
let show,availability={},occupied={},sid=params.get('session')||'',zoneId='',selected=new Set(),gradeId='',quantity=0,zoom=1,confirming=false,busy=false,preview=false,loaded=false,completed=false;
const error=m=>{$('#popup-error').textContent=m;$('#popup-error').hidden=!m;};
const notice=m=>{$('#popup-notice').textContent=m;$('#popup-notice').hidden=!m;};
const seats=()=>flattenSeats(show.seatMap),zone=()=>show.seatMap?.zones.find(z=>z.id===zoneId),sold=()=>new Set(occupied[sid]||[]);
const chosen=()=>seats().filter(s=>selected.has(s.id));
const remaining=g=>availability[sid]?.[g.id]??0;
function closed(){const schedule=show.sessions.find(s=>s.id===sid);return (!show.published&&!preview)||!schedule||Date.parse(schedule.date+'T'+schedule.time+':00+09:00')<=Date.now()||!!(show.salesStart&&Date.parse(show.salesStart+':00+09:00')>Date.now());}
function amount(){return show.seatMap?chosen().reduce((n,s)=>n+(show.grades.find(g=>g.id===s.gradeId)?.price||0),0):(show.grades.find(g=>g.id===gradeId)?.price||0)*quantity;}
function chooseZone(id){zoneId=id;confirming=false;render();}
function renderMap(target,large=false){target.replaceChildren();if(!show.seatMap){target.append(el('p','좌석도 미등록','popup-empty'));return;}const svg=mapElement(show.seatMap.svg);bindZones(svg,show.seatMap.zones,chooseZone,zoneId);svg.style.width=(large?100:zoom*100)+'%';target.append(svg);}
function drawSeats(){const target=$('#seat-grid'),map=$('#large-map'),z=zone();target.replaceChildren();target.hidden=!z;map.hidden=!!z;$('#stage-heading').hidden=!z;
 if(!z){if(show.seatMap){renderMap(map,true);}else{const box=el('div',undefined,'quantity-stage'),img=el('img');img.src=show.poster;img.alt='';box.append(img,el('h2','좌석등급·매수 선택'),el('p','좌석도가 등록되지 않은 공연입니다.'),el('p','오른쪽에서 좌석등급과 매수를 선택해 주세요.'));map.replaceChildren(box);}return;}
 $('#current-zone-label').textContent='현재 보고 계신 구역은 '+z.name+' 구역입니다.';
 if(!z.seats.length){target.style.gridTemplateColumns='1fr';target.append(el('p','이 구역의 좌석은 준비 중입니다.','popup-empty'));return;}
 target.style.gridTemplateColumns=`32px repeat(${z.columns},var(--seat-size,22px))`;
 const cells=new Map(z.seats.map(s=>[s.row+':'+s.col,s])),taken=sold();
 for(let row=1;row<=z.rows;row++){target.append(el('span',row,'seat-row-number'));for(let col=1;col<=z.columns;col++){const seat=cells.get(row+':'+col);if(!seat){target.append(el('span','', 'seat-space'));continue;}const grade=show.grades.find(g=>g.id===seat.gradeId),b=el('button',undefined,'seat-square'+(selected.has(seat.id)?' selected':''));b.type='button';b.style.setProperty('--seat-color',grade?.color||'#bea886');b.disabled=seat.blocked||taken.has(seat.id)||closed()||completed;b.setAttribute('aria-label',`${seatLabel(seatWithZone(seat,z))} · ${grade?.name||''} · ${b.disabled?'선택 불가':money(grade?.price||0)}`);b.setAttribute('aria-pressed',String(selected.has(seat.id)));b.title=b.getAttribute('aria-label');b.addEventListener('click',()=>{error('');if(selected.has(seat.id))selected.delete(seat.id);else{if(selected.size>=show.maxTickets){error(`회차당 최대 ${show.maxTickets}매까지 선택할 수 있습니다.`);return;}selected.add(seat.id);}confirming=false;render();});target.append(b);}}
}
function seatWithZone(s,z){return{...s,zoneName:z.name};}
function renderGrades(){const target=$('#popup-grades');target.replaceChildren();show.grades.forEach(g=>{const line=el('button',undefined,'grade-line');line.type='button';const color=el('i',undefined,'color');color.style.setProperty('--seat-color',g.color);const label=el('span',g.name);label.append(el('small',`잔여 ${remaining(g)}석`));line.append(color,label,el('span',money(g.price),'price'));const details=el('div',undefined,'grade-zone-list');
  if(show.seatMap){show.seatMap.zones.filter(z=>z.seats.some(s=>s.gradeId===g.id)).forEach(z=>{const b=el('button',z.name+'구역');b.type='button';b.addEventListener('click',()=>chooseZone(z.id));details.append(b);});line.addEventListener('click',()=>{details.hidden=!details.hidden;});}
  else{line.setAttribute('aria-pressed',String(gradeId===g.id));line.addEventListener('click',()=>{gradeId=g.id;quantity=remaining(g)>0?1:0;confirming=false;render();});if(gradeId===g.id){const label=el('label','선택 매수','grade-quantity'),select=el('select');select.setAttribute('aria-label',g.name+' 매수');for(let n=1;n<=Math.min(show.maxTickets,remaining(g));n++){const o=el('option',n+'매');o.value=n;select.append(o);}select.value=String(quantity);select.addEventListener('change',()=>{quantity=Number(select.value);confirming=false;renderSelection();});label.append(select);details.append(label);}}
  target.append(line,details);
 });}
function renderSelection(){
 const count=show.seatMap?selected.size:quantity,bar=$('#toggle-selected');bar.replaceChildren(document.createTextNode(count?`${count}석 선택 · ${money(amount())}`:'좌석을 선택해 주세요.'),el('span','⌃'));
 const tray=$('#selected-tray');tray.replaceChildren();chosen().forEach(s=>{const item=el('span',undefined,'selected-item'),b=el('button','×');b.type='button';b.setAttribute('aria-label',seatLabel(s)+' 선택 해제');b.addEventListener('click',()=>{selected.delete(s.id);confirming=false;render();});item.append(el('span',seatLabel(s)),b);tray.append(item);});
 $('#popup-confirm').hidden=!confirming;
 const next=$('#seat-next');next.disabled=busy||!count||closed()||preview||completed;next.replaceChildren(document.createTextNode(completed?'신청 저장 완료':confirming?'예매 신청 저장':'좌석 선택 완료'),el('span','›'));
}
function render(){
 $('#popup-title').textContent=show.title;document.title='좌석 선택 | '+show.title;
 const select=$('#popup-session');select.replaceChildren(...show.sessions.map(s=>{const o=el('option',dateLabel(s.date)+' '+s.time);o.value=s.id;return o;}));select.value=sid;select.disabled=completed;
 if(!preview)notice(!show.published?'관리자 미리보기 · 비공개 공연은 신청할 수 없습니다.':closed()?'예매 오픈 전이거나 선택한 공연 회차가 종료되었습니다.':'');
 renderMap($('#mini-map'));drawSeats();renderGrades();renderSelection();
 $('#show-overview').disabled=!show.seatMap;
}
async function refresh(){if(preview)return;const result=await api('/api/shows/'+encodeURIComponent(id));show=result.show;availability=result.availability;occupied=result.occupied||{};if(!show.sessions.some(s=>s.id===sid))sid=show.sessions[0]?.id||'';const valid=new Set(seats().filter(s=>!s.blocked&&!sold().has(s.id)).map(s=>s.id));const removed=[...selected].some(s=>!valid.has(s));selected=new Set([...selected].filter(s=>valid.has(s)));if(removed){confirming=false;error('다른 방문자가 신청했거나 변경된 좌석을 선택 목록에서 해제했습니다.');}if(!show.grades.some(g=>g.id===gradeId))gradeId='';if(gradeId)quantity=Math.min(quantity,remaining({id:gradeId}));render();}
function confirm(){
 const box=$('#popup-confirm');box.replaceChildren(el('h2','선택 내역 확인'));const schedule=show.sessions.find(s=>s.id===sid);box.append(el('p',dateLabel(schedule.date)+' '+schedule.time));const list=el('ul');if(show.seatMap)chosen().forEach(s=>list.append(el('li',seatLabel(s)+' · '+show.grades.find(g=>g.id===s.gradeId)?.name)));else list.append(el('li',(show.grades.find(g=>g.id===gradeId)?.name||'')+' '+quantity+'매'));box.append(list,el('strong','공연 금액 '+money(amount())),el('p','결제·발권 없이 예매 신청을 저장합니다. 현재 금액은 청구되지 않습니다.'));const label=el('label'),check=el('input');check.type='checkbox';check.id='popup-agreement';label.append(check,document.createTextNode('결제·발권이 없는 예매 신청임을 확인했습니다.'));box.append(label);const back=el('button','좌석 다시 선택');back.type='button';back.addEventListener('click',()=>{confirming=false;renderSelection();});box.append(back);confirming=true;renderSelection();box.scrollIntoView({block:'nearest'});
}
$('#seat-next').addEventListener('click',async()=>{
 if(busy||preview||completed)return;error('');if(!confirming){confirm();return;}if(!$('#popup-agreement')?.checked){error('신청 안내를 확인해 주세요.');return;}
 busy=true;renderSelection();try{await session();const body={showId:show.id,sessionId:sid};if(show.seatMap)body.seatIds=[...selected];else Object.assign(body,{gradeId,quantity});const result=await api('/api/reservations',{method:'POST',body});completed=true;$('#reservation-shell').classList.add('popup-receipt');const box=$('#popup-confirm');box.hidden=false;box.replaceChildren(el('h2','예매 신청이 저장되었습니다'),el('p',result.reservation.id),el('p',result.message));const link=el('a','마이티켓에서 신청 확인');link.href='myticket.html';box.append(link);notice('신청이 저장되었습니다. 결제·발권은 진행되지 않았습니다.');drawSeats();}catch(e){error(e.message);confirming=false;await refresh().catch(()=>{});}finally{busy=false;if(!completed)renderSelection();else{$('#seat-next').disabled=true;$('#seat-next').textContent='신청 저장 완료';}}
});
$('#popup-session').addEventListener('change',async()=>{sid=$('#popup-session').value;selected.clear();quantity=0;gradeId='';confirming=false;error('');render();await refresh().catch(e=>error(e.message));});
$('#seat-refresh').addEventListener('click',async()=>{error('');try{await refresh();}catch(e){error(e.message);}});
$('#toggle-selected').addEventListener('click',()=>{const tray=$('#selected-tray');tray.hidden=!tray.hidden;$('#toggle-selected').setAttribute('aria-expanded',String(!tray.hidden));});
$('#show-overview').addEventListener('click',()=>{zoneId='';render();});
$('#map-zoom-in').addEventListener('click',()=>{zoom=Math.min(3,zoom+.25);renderMap($('#mini-map'));});$('#map-zoom-out').addEventListener('click',()=>{zoom=Math.max(1,zoom-.25);renderMap($('#mini-map'));});
window.addEventListener('focus',()=>{if(loaded&&!completed&&!preview)refresh().catch(()=>{});});
try{
 const previewKey=params.get('preview');if(previewKey){const saved=JSON.parse(localStorage.getItem('winticket-preview-'+previewKey)||'null');if(!saved||Date.now()-saved.created>1200000)throw new Error('미리보기 유효기간이 지났습니다. 관리자에서 다시 열어 주세요.');show=saved.show;preview=true;sid=show.sessions[0]?.id||'';occupied={};availability=Object.fromEntries(show.sessions.map(s=>[s.id,Object.fromEntries(show.grades.map(g=>[g.id,show.seatMap?seats().filter(x=>!x.blocked&&x.gradeId===g.id).length:g.capacity]))]));notice('관리자 미리보기 · 저장 전 화면이며 신청은 진행되지 않습니다.');render();}
 else{if(!id)throw new Error('공연 정보가 없습니다.');await session();await refresh();}
 loaded=true;$('#reservation-shell').setAttribute('aria-busy','false');
}catch(e){error(e.message);$('#popup-title').textContent='공연을 불러오지 못했습니다.';$('#reservation-shell').setAttribute('aria-busy','false');}

