import {catalog,showLink} from './api.js?v=supabase-1';
(async() => {
 const $=(s,p=document)=>p.querySelector(s), $$=(s,p=document)=>[...p.querySelectorAll(s)];
 const dialog=$('#site-dialog'), body=$('#dialog-body'), heading=$('#dialog-title');
 function open(title){heading.textContent=title;body.replaceChildren();if(!dialog.open)dialog.showModal();}
 $('.dialog-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 const note='현재 윈트티켓 메인 페이지 시안입니다. 실제 예매·결제 기능은 준비 중입니다.';
 function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;}
 let shows=[];try{shows=(await catalog()).shows;}catch{}
 const matchShow=record=>shows.find(s=>s.id===record.id||s.poster===record.image||s.legacyPoster===record.image||s.title===record.title);
 const posterList=$('#perf_poster');
 if(shows.length&&posterList){posterList.replaceChildren();shows.forEach(s=>{const li=document.createElement('li'),a=document.createElement('a');a.className='inner';a.href=showLink(s.id);const thumb=document.createElement('span');thumb.className='thumb';const image=document.createElement('img');image.src=s.poster;image.alt=s.title;image.loading='lazy';thumb.append(image);a.append(thumb,text('strong',s.title,'tit'),text('span',s.period,'day'),text('span',s.venue,'location'));li.append(a);posterList.append(li);});}
 const records=[];const seen=new Set();
 $$('#cont_wrap a').forEach(a=>{
   const li=a.closest('li'), image=$('img',a)|| (li&&$('img',li));
   if(!image)return;
   const title=(li?.dataset.tiaraProductTitle || $('.name',a)?.textContent || $('.tit',a)?.textContent || $('.tit_cont',a)?.textContent || $('.txt',li||a)?.textContent || a.textContent || image.alt).trim();
   if(!title||seen.has(title))return;seen.add(title);
   const record={title,image:image.getAttribute('src'),day:$('.day',li||a)?.textContent?.trim()||'',location:$('.location',li||a)?.textContent?.trim()||''};const linked=matchShow(record);if(linked){record.id=linked.id;record.category=linked.category;}records.push(record);
 });
 function detail(record){
   const show=matchShow(record);if(show){location.href=showLink(show.id);return;}
   open(record.title);const row=document.createElement('div');row.className='detail-layout';const img=document.createElement('img');img.src=record.image;img.alt=record.title;
   const info=document.createElement('div');info.className='detail-info';
   if(record.day)info.append(text('p',record.day));if(record.location)info.append(text('p',record.location));info.append(text('p',note,'detail-note'));row.append(img,info);body.append(row);
 }
 function results(title,list){open(title);if(!list.length){body.append(text('p','검색 결과가 없습니다. 다른 공연명으로 검색해 주세요.'));return;}const grid=document.createElement('div');grid.className='results';list.forEach(record=>{const b=document.createElement('button');b.className='result-card';const i=document.createElement('img');i.src=record.image;i.alt='';b.append(i,text('span',record.title));b.addEventListener('click',()=>detail(record));grid.append(b);});body.append(grid);}
 function search(){const q=$('#top_search').value.trim()||'원더리벳';results('“'+q+'” 검색 결과',records.filter(r=>r.title.toLocaleLowerCase().includes(q.toLocaleLowerCase())));}
 $('#btn_top_search').addEventListener('click',search);$('#top_search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
 const slider=$('#sliderInner');let index=3;let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const slides=$$('li',slider);slides.forEach(s=>s.classList.add('on'));
 const wideCarousel=matchMedia('(min-width:1151px)');
 function render(){const offset=wideCarousel.matches?3:0;slides.forEach((s,i)=>{const order=(i-index+offset+slides.length)%slides.length;s.style.order=String(order);s.classList.toggle('on',!offset||(order>=3&&order<7));});}
 wideCarousel.addEventListener('change',render);
 function step(delta){index=(index+delta+slides.length)%slides.length;render();}render();
 $('#slider>.prev').addEventListener('click',e=>{e.preventDefault();step(-1);});$('#slider>.next').addEventListener('click',e=>{e.preventDefault();step(1);});
 const play=$('#slider>.play'),stop=$('#slider>.stop');
 function playback(){play.style.display=paused?'block':'none';stop.style.display=paused?'none':'block';}playback();
 play.addEventListener('click',e=>{e.preventDefault();paused=false;playback();});stop.addEventListener('click',e=>{e.preventDefault();paused=true;playback();});
 let hovering=false;$('#slider').addEventListener('mouseenter',()=>hovering=true);$('#slider').addEventListener('mouseleave',()=>hovering=false);
 const topLink=$('.wint-top');function toggleTop(){topLink?.classList.toggle('is-visible',scrollY>600);}window.addEventListener('scroll',toggleTop,{passive:true});toggleTop();
 setInterval(()=>{if(!paused&&!hovering&&!document.hidden&&!dialog.open&&!$('#slider').contains(document.activeElement))step(1);},6000);
 const tabs=$$('.list_main_performance>li');tabs.forEach(li=>$('.tit a',li).addEventListener('click',e=>{e.preventDefault();tabs.forEach(t=>t.classList.toggle('on',t===li));}));if(!tabs.some(t=>t.classList.contains('on')))tabs[0]?.classList.add('on');
 const rankTabs=$$('.list_main_rank>li');rankTabs.forEach(li=>$('h2 a',li)?.addEventListener('click',e=>{e.preventDefault();rankTabs.forEach(t=>t.classList.toggle('on',t===li));}));
 const banners=$$('.cmn_banner .item');let banner=Math.max(0,banners.findIndex(b=>b.style.display!=='none'));
 $$('.gnb_banner_btn a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();banner=(banner+(a.classList.contains('next')?1:-1)+banners.length)%banners.length;banners.forEach((b,i)=>b.style.display=i===banner?'block':'none');}));
 function scrollToSelector(sel){const el=$(sel);if(el)el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
 $$('.wint-nav').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const label=a.textContent.trim();if(label==='마이티켓'){location.href='myticket.html';return;}if(label==='티켓오픈소식')return scrollToSelector('.box_ticket_open');if(label==='랭킹')return scrollToSelector('.box_ranking');if(label==='콘서트')return scrollToSelector('.wrap_main_concert');if(label==='뮤지컬/연극')return results(label,records.filter(r=>r.category===label||/뮤지컬|연극/.test(r.title)));if(label==='전시/행사')return results(label,records.filter(r=>r.category===label||/전시|사진전|그라운드/.test(r.title)));if(label==='클래식')return results(label,records.filter(r=>r.category===label||/클래식|오케스트라|피아노|협주곡|Diana|Tango/.test(r.title)));if(label==='팬클럽/팬미팅')return results(label,records.filter(r=>r.category===label||/팬|NCT|PARK|WISH/.test(r.title)));open(label);body.append(text('p',note));}));
 document.addEventListener('click',e=>{
   const a=e.target.closest('a[href="#"]');if(!a||e.defaultPrevented)return;e.preventDefault();
   const li=a.closest('li'),img=$('img',a)||(li&&$('img',li));
   if(img){const record=records.find(r=>r.image===img.getAttribute('src'));if(record)return detail(record);}
   const label=a.dataset.actionLabel||a.textContent.trim()||'안내';
   if(/맨 위/.test(label)){window.scrollTo({top:0,behavior:'smooth'});return;}
   if(/For U/.test(label))return results('당신을 위한 추천 공연',records.slice(0,9));
   open(label);body.append(text('p',/로그인|회원가입/.test(label)?'회원 서비스는 준비 중입니다. 계정 정보는 입력받지 않습니다.':note));
 });
 const params=new URLSearchParams(location.search);if(params.get('q')){$('#top_search').value=params.get('q');search();}else if(params.get('category')){const a=$$('.wint-nav').find(a=>a.textContent.trim()===params.get('category'));a?.click();}
})();
