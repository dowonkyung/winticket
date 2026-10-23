const search=document.querySelector('#top_search');
function runSearch(){location.href='index.html?q='+encodeURIComponent(search.value.trim());}
document.querySelector('#btn_top_search')?.addEventListener('click',runSearch);
search?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}});
document.querySelectorAll('#header .wint-nav').forEach(a=>{a.href=a.textContent.trim()==='마이티켓'?'myticket.html':'index.html?category='+encodeURIComponent(a.textContent.trim());});
document.querySelectorAll('.wint-util').forEach(a=>{a.href='#';a.addEventListener('click',e=>{e.preventDefault();const notice=document.querySelector('#site-notice');if(notice){notice.textContent=a.textContent.trim()+' 서비스는 준비 중입니다. 예매 신청 내역은 마이티켓에서 확인할 수 있습니다.';notice.hidden=false;notice.scrollIntoView({block:'center'});}});});
document.querySelectorAll('#footer a[href="#"]').forEach(a=>{a.addEventListener('click',e=>{e.preventDefault();const notice=document.querySelector('#site-notice');if(notice){notice.textContent=a.textContent.trim()+' 서비스는 준비 중입니다.';notice.hidden=false;notice.scrollIntoView({block:'center'});}});});
document.querySelectorAll('.gnb_banner_btn a').forEach(a=>a.addEventListener('click',e=>e.preventDefault()));
