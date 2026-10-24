import {session} from './api.js?v=members-1';
import {signOut} from './member-auth.js?v=members-1';
document.querySelector('#util_menu .top_left')?.remove();
const login=document.querySelector('.btn_g_login'),join=document.querySelector('.btn_g_join');
if(login)login.href='login.html';if(join)join.href='login.html?mode=signup';
const language=document.querySelector('#util_menu .global_link');if(language){language.innerHTML='<details class="header-language"><summary aria-label="언어 선택">LANGUAGE</summary><div class="header-language-options"><button type="button" aria-current="true">한국어</button></div></details>';language.querySelector('button').onclick=()=>language.querySelector('details').open=false;}
session().then(s=>{if(!s.member)return;const name=document.querySelector('#name_area');if(name){const nickname=document.createElement('em');nickname.textContent=s.member.nickname;name.replaceChildren(nickname,document.createTextNode(' 님 반갑습니다!'));}if(join)join.closest('li').hidden=true;if(login){login.className='wint-util btn_gnb btn_g_logout';login.textContent='로그아웃';login.setAttribute('aria-label','로그아웃');login.dataset.actionLabel='로그아웃';login.href='#';login.addEventListener('click',async e=>{e.preventDefault();try{await signOut();location.reload();}catch{login.title='로그아웃하지 못했습니다. 다시 시도해 주세요.';}});}}).catch(()=>{});
