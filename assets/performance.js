import {api,session,catalog,el,money,dateLabel} from './api.js';
const root=document.querySelector('#booking-root');
const id=new URLSearchParams(location.search).get('id')||'nct-wish-2027';
let show,availability={},offline=false,selectedDate='',selectedSession='',month='',busy=false;
const dialog=document.querySelector('#booking-dialog');
const error=document.querySelector('#booking-error');
function errorText(message){error.textContent=message;error.hidden=!message;}
function section(title,content){const s=el('section',undefined,'detail-section');s.append(el('h2',title));if(typeof content==='string')s.append(el('p',content,'plain-copy'));else s.append(content);return s;}
function button(text,cls,fn){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
function salesClosed(){return !!show.salesStart&&Date.parse(show.salesStart+':00+09:00')>Date.now();}
function validSession(s){return Date.parse(s.date+'T'+s.time+':00+09:00')>Date.now();}
function available(g){return availability[selectedSession]?.[g.id]??0;}
function renderCalendar(){
 const target=document.querySelector('#date-panel');target.replaceChildren();const head=el('div',undefined,'calendar-heading');
 const [y,m]=month.split('-').map(Number);const dates=[...new Set(show.sessions.map(s=>s.date))].sort(),min=dates[0]?.slice(0,7),max=dates.at(-1)?.slice(0,7);
 function move(delta){const d=new Date(Date.UTC(y,m-1+delta,1));month=d.toISOString().slice(0,7);renderCalendar();}
 const prev=button('‹','',()=>move(-1));prev.setAttribute('aria-label','이전 달');prev.disabled=!min||month<=min;
 const next=button('›','',()=>move(1));next.setAttribute('aria-label','다음 달');next.disabled=!max||month>=max;
 head.append(prev,el('strong',`${y}. ${String(m).padStart(2,'0')}`),next);target.append(head);
 const grid=el('div',undefined,'calendar-grid');['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach((d,i)=>grid.append(el('span',d,'weekday '+(i===0?'sun':i===6?'sat':''))));
 const first=new Date(Date.UTC(y,m-1,1)).getUTCDay(),last=new Date(Date.UTC(y,m,0)).getUTCDate();for(let i=0;i<first;i++)grid.append(el('span',''));
 for(let d=1;d<=last;d++){
  const date=`${month}-${String(d).padStart(2,'0')}`,can=show.sessions.some(s=>s.date===date&&validSession(s)),b=button(String(d),can?'available':'',()=>{selectedDate=date;selectedSession='';renderCalendar();renderTime();renderSeats();});
  b.disabled=!can;b.setAttribute('aria-label',dateLabel(date));b.setAttribute('aria-pressed',String(date===selectedDate));if(date===selectedDate)b.classList.add('selected');grid.append(b);
 }target.append(grid);if(!show.sessions.length)target.append(el('p','공연 회차가 준비 중입니다.','step-placeholder'));
}
function renderTime(){const p=document.querySelector('#time-panel');p.replaceChildren();if(!selectedDate){p.append(el('p','날짜를 선택해주세요!','step-placeholder'));return;}const list=el('div',undefined,'time-options');show.sessions.filter(s=>s.date===selectedDate).forEach(s=>{const b=button(s.time,'time-option',()=>{selectedSession=s.id;renderTime();renderSeats();});b.disabled=!validSession(s);b.setAttribute('aria-label',`${s.time} 회차`);b.setAttribute('aria-pressed',String(s.id===selectedSession));list.append(b);});p.append(list);}
function renderSeats(){const p=document.querySelector('#seat-panel');p.replaceChildren();if(!selectedSession)p.append(el('p','시간을 선택하면 잔여 수량을 확인할 수 있어요.','step-placeholder'));else show.grades.forEach(g=>{const row=el('div',undefined,'grade-option'),label=el('span'),dot=el('i',undefined,'grade-dot');dot.style.backgroundColor=g.color;label.append(dot,document.createTextNode(g.name));const info=el('span',money(g.price));info.append(el('small',`잔여 ${available(g).toLocaleString('ko-KR')}매`));row.append(label,info);p.append(row);});
 const reserve=document.querySelector('#reserve-open');reserve.disabled=offline||salesClosed()||!selectedSession||!show.grades.some(g=>available(g)>0);reserve.textContent=offline?'서버 연결 필요':salesClosed()?'예매 오픈 전':show.sessions.length?'좌석등급 선택':'예매 준비 중';
}
function renderPage(){
 root.replaceChildren();document.title=show.title+' | 윈트티켓';
 const crumb=el('div',undefined,'booking-breadcrumb'),home=el('a','홈');home.href='index.html';crumb.append(home,document.createTextNode('  >  '+show.category+'  >  공연 상세'));root.append(crumb);
 if(offline)root.append(el('p','공연 정보를 미리보기로 표시하고 있습니다. 현재 예매 서버에 연결되지 않아 신청할 수 없습니다. 잠시 뒤 새로고침해 주세요.','notice-banner'));
 if(!show.published)root.append(el('p','관리자 미리보기 · 아직 공개되지 않은 공연입니다.','notice-banner'));
 const product=el('section',undefined,'booking-product'),posterCol=el('div'),poster=el('img',undefined,'booking-poster');poster.src=show.poster;poster.alt=show.title;posterCol.append(poster);
 const links=el('div',undefined,'poster-links');const mine=el('a','예매 신청 내역','secondary-btn');mine.href='myticket.html';links.append(mine);posterCol.append(links);
 const info=el('div'),tags=el('div',undefined,'booking-tags');if(show.exclusive)tags.append(el('span','단독판매','booking-tag'));tags.append(el('span','공연 안내','booking-tag'));info.append(tags,el('h1',show.title));
 const meta=el('dl',undefined,'product-meta');for(const [label,value] of [['공연기간',show.period||'준비 중'],['공연장',show.venue],['관람시간',show.duration||'-'],['관람등급',show.age||'공연 안내 참고'],['장르',show.category],['예매방식','좌석등급별 수량 신청']]){const row=el('div'),dt=el('dt',label),dd=el('dd',value);row.append(dt,dd);meta.append(row);}info.append(meta);product.append(posterCol,info);root.append(product);
 const process=el('section',undefined,'booking-process');[['01','날짜 선택','date-panel'],['02','시간 선택','time-panel'],['03','좌석 선택','seat-panel']].forEach(([n,title,id])=>{const s=el('div',undefined,'booking-step'),h=el('h2');h.append(el('b',n),document.createTextNode(title));const panel=el('div');panel.id=id;s.append(h,panel);process.append(s);});root.append(process);
 const controls=el('div',undefined,'booking-controls');const open=button('좌석등급 선택','primary-btn',openBooking);open.id='reserve-open';const opening=show.salesStart?'일반예매 오픈 : '+show.salesStart.replace('T',' ')+' (한국시간)':'회차당 최대 '+show.maxTickets+'매 · 결제 없는 예매 신청';controls.append(el('p',opening),open);root.append(controls);
 const tabs=el('div',undefined,'booking-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','공연 상세 메뉴');const panels={};
 [['detail','상세정보'],['venue','공연장정보'],['guide','예매안내']].forEach(([key,label],i)=>{const b=button(label,'',()=>selectTab(key));b.id='tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls','panel-'+key);b.setAttribute('aria-selected',String(i===0));b.tabIndex=i===0?0:-1;tabs.append(b);const p=el('div');p.id='panel-'+key;p.setAttribute('role','tabpanel');p.setAttribute('aria-labelledby',b.id);p.hidden=i!==0;panels[key]=p;});
 tabs.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const keys=['detail','venue','guide'],current=keys.findIndex(k=>document.activeElement.id==='tab-'+k),next=e.key==='Home'?0:e.key==='End'?2:(current+(e.key==='ArrowRight'?1:2))%3;selectTab(keys[next]);document.querySelector('#tab-'+keys[next]).focus();}});
 function selectTab(key){for(const k of Object.keys(panels)){panels[k].hidden=k!==key;const b=document.querySelector('#tab-'+k);b.setAttribute('aria-selected',String(k===key));b.tabIndex=k===key?0:-1;}}
 const columns=el('div',undefined,'detail-columns'),left=el('div');left.append(...Object.values(panels));const aside=el('aside',undefined,'booking-aside');aside.append(el('h2','추천 공연'));columns.append(left,aside);root.append(tabs,columns);
 if(show.artist)panels.detail.append(section('출연진',show.artist));panels.detail.append(section('공연시간',show.sessions.length?show.sessions.map(s=>dateLabel(s.date)+' '+s.time).join('\n'):'공연 일정은 준비 중입니다.'));
 const prices=el('div');if(!show.grades.length)prices.append(el('p','가격 정보는 준비 중입니다.'));show.grades.forEach(g=>{const row=el('div',undefined,'price-line'),dot=el('i',undefined,'grade-dot');dot.style.backgroundColor=g.color;row.append(dot,el('span',g.name),el('span',money(g.price)));prices.append(row);});panels.detail.append(section('가격정보',prices),section('예매 공지사항',show.notice||'공지사항이 없습니다.'));
 const description=section('작품설명',show.description||'상세정보는 준비 중입니다.');if(show.detailImage){const image=el('img',undefined,'detail-image');image.src=show.detailImage;image.alt=show.title+' 상세 안내';image.loading='lazy';description.append(image);}panels.detail.append(description);if(show.organizer)panels.detail.append(section('기획사 정보',show.organizer));
 panels.venue.append(section(show.venue,show.address||'공연장 주소는 준비 중입니다.'));
 panels.guide.append(section('예매 신청 안내',`날짜와 시간을 선택한 뒤 좌석등급과 수량을 선택해 주세요.\n회차당 최대 ${show.maxTickets}매까지 신청할 수 있습니다.\n신청은 서버에 저장되며, 이 브라우저의 마이티켓에서 확인·취소할 수 있습니다.\n현재 결제·발권 및 지정 좌석 배정은 제공하지 않습니다. 등급별 수량 신청이며 유료 티켓이 발급되지 않습니다.\n신청 내역을 보려면 동일한 브라우저를 이용해 주세요. 쿠키 삭제 시 내역 확인이 어려울 수 있습니다.`));
 renderCalendar();renderTime();renderSeats();
 catalog().then(({shows})=>shows.filter(s=>s.id!==show.id).slice(0,3).forEach(s=>{const a=el('a',undefined,'related-link');a.href='performance.html?id='+encodeURIComponent(s.id);const i=el('img');i.src=s.poster;i.alt='';const t=el('span',s.title);t.append(el('small',s.period));a.append(i,t);aside.append(a);})).catch(()=>{});
}
async function openBooking(){
 errorText('');try{const fresh=await api('/api/shows/'+encodeURIComponent(show.id));show=fresh.show;availability=fresh.availability;renderSeats();if(salesClosed())throw new Error('아직 예매 오픈 전입니다.');if(!selectedSession)throw new Error('시간을 선택해 주세요.');if(!show.sessions.some(s=>s.id===selectedSession)){selectedDate='';selectedSession='';month=(show.sessions[0]?.date||new Date().toISOString().slice(0,10)).slice(0,7);renderCalendar();renderTime();renderSeats();throw new Error('공연 회차가 변경되었습니다. 날짜와 시간을 다시 선택해 주세요.');}if(!show.grades.some(g=>available(g)>0))throw new Error('선택한 회차의 잔여 수량이 없습니다.');await session();
 const body=document.querySelector('#booking-dialog-body');body.replaceChildren();const schedule=show.sessions.find(s=>s.id===selectedSession);body.append(el('h2',show.title));const summary=el('div',undefined,'booking-summary');summary.append(el('p',dateLabel(schedule.date)+' '+schedule.time),el('p',show.venue));body.append(summary);
 const gradeLabel=el('label','좌석등급'),grade=el('select');grade.id='booking-grade';gradeLabel.htmlFor=grade.id;show.grades.forEach(g=>{const o=el('option',`${g.name} · ${money(g.price)} · 잔여 ${available(g)}매`);o.value=g.id;o.disabled=available(g)<1;grade.append(o);});grade.value=show.grades.find(g=>available(g)>0)?.id||'';
 const quantityLabel=el('label','매수'),quantity=el('select');quantity.id='booking-quantity';quantityLabel.htmlFor=quantity.id;const total=el('p',undefined,'total');function quantities(){const max=Math.min(show.maxTickets,available(show.grades.find(g=>g.id===grade.value)||{id:''}));quantity.replaceChildren();for(let n=1;n<=max;n++){const o=el('option',n+'매');o.value=String(n);quantity.append(o);}updateTotal();}function updateTotal(){const g=show.grades.find(g=>g.id===grade.value);total.textContent='공연 금액 '+money((g?.price||0)*Number(quantity.value||0));}grade.addEventListener('change',quantities);quantity.addEventListener('change',updateTotal);
 const notice=el('p','결제와 지정 좌석 배정 없이 좌석등급별 수량을 신청합니다. 금액은 공연 가격 안내이며 현재 청구되지 않습니다.','notice-banner');
 const agreement=el('label',undefined,'agreement'),check=el('input');check.type='checkbox';check.id='booking-agreement';agreement.append(check,el('span','결제·발권이 진행되지 않는 예매 신청임을 확인했습니다.'));
 const message=el('p',undefined,'notice-banner error-banner');message.hidden=true;message.setAttribute('role','alert');
 const submit=button('예매 신청하기','primary-btn',async()=>{if(busy)return;if(!check.checked){message.textContent='신청 안내를 확인해 주세요.';message.hidden=false;return;}busy=true;submit.disabled=true;message.hidden=true;try{const result=await api('/api/reservations',{method:'POST',body:{showId:show.id,sessionId:selectedSession,gradeId:grade.value,quantity:Number(quantity.value)}});body.replaceChildren(el('h2','예매 신청이 저장되었습니다'),el('p',result.message),el('p',result.reservation.id,'confirmation-code'));const link=el('a','마이티켓에서 신청 확인','primary-btn');link.href='myticket.html';body.append(link);const fresh=await api('/api/shows/'+encodeURIComponent(show.id));availability=fresh.availability;renderSeats();}catch(e){message.textContent=e.message;message.hidden=false;}finally{busy=false;submit.disabled=false;}});
 body.append(gradeLabel,grade,quantityLabel,quantity,total,notice,agreement,message,submit);quantities();dialog.showModal();
 }catch(e){errorText(e.message);}
}
document.querySelector('#booking-dialog-close').addEventListener('click',()=>dialog.close());
try{
 try{const result=await api('/api/shows/'+encodeURIComponent(id));show=result.show;availability=result.availability;}catch(e){if(e.status)throw e;const result=await catalog();show=result.shows.find(s=>s.id===id);if(!show)throw new Error('공연을 찾을 수 없습니다.');offline=true;}
 month=(show.sessions[0]?.date||new Date().toISOString().slice(0,10)).slice(0,7);renderPage();
}catch(e){root.replaceChildren(el('h1','공연을 불러오지 못했습니다.','page-title'),el('p',e.message,'notice-banner error-banner'));}
