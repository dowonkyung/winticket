import {session} from './api.js?v=members-1';
import {signOut} from './member-auth.js?v=members-1';
const login=document.querySelector('.btn_g_login'),join=document.querySelector('.btn_g_join');
if(login)login.href='login.html';if(join)join.href='login.html?mode=signup';
function plain(a,label){a.className='member-util';a.textContent=label;a.setAttribute('aria-label',label);}
session().then(s=>{if(!s.member)return;const name=document.querySelector('#name_area');if(name)name.textContent=s.member.nickname+'님';if(join){plain(join,'마이티켓');join.href='myticket.html';}if(login){plain(login,'로그아웃');login.href='#';login.addEventListener('click',async e=>{e.preventDefault();try{await signOut();location.reload();}catch{login.textContent='로그아웃 재시도';}});}}).catch(()=>{});
