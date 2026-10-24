import {homeSections} from './homepage-model.js?v=brand-1';
import {el,showLink} from './api.js?v=members-1';
export function renderHomepage(sections,shows){
 if(!sections)return;const byId=new Map(shows.map(s=>[s.id,s]));
 for(const {key,selector} of homeSections){
  if(!Array.isArray(sections[key]))continue;const root=document.querySelector(selector);if(!root)continue;root.replaceChildren();
  for(const id of sections[key]){const s=byId.get(id);if(!s)continue;
   const li=el('li'),a=el('a');a.href=showLink(s.id);li.dataset.showId=s.id;
   const thumb=el(key==='slider'?'span':'div',undefined,'thumb'),img=el('img');img.src=s.poster;img.alt=s.title;if(key!=='slider')img.loading='lazy';const frame=el('span',undefined,'frame');
   if(key==='slider'){
    const off=el('span',undefined,'thumb_off');off.append(img,frame);thumb.append(off);a.append(thumb);const txt=el('span',undefined,'txt'),hover=el('span',undefined,'txt txt_hover');txt.append(el('span',s.title,'name'),el('span',s.venue,'opt'));hover.append(el('span',s.title,'name'),el('span',s.period,'day'));a.append(txt,hover);li.append(a);
   }else if(key==='pick'){
    a.className='inner';thumb.append(img);a.append(thumb,el('strong',s.title,'tit'),el('span',s.period,'day'),el('span',s.venue,'location'));li.append(a);
   }else{
    a.append(img,frame);thumb.append(a);const txt=el('div',undefined,'txt'),link=el('a',s.title);link.href=a.href;txt.append(link);li.append(thumb,txt);
   }root.append(li);
  }
  if(!root.children.length){root.append(el('li','등록된 공연이 없습니다.','home-empty'));if(key==='slider')document.querySelector('.wrap_main_slider').hidden=true;}
 }
}
