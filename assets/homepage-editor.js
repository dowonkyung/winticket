import {homeSections,defaultHome} from './homepage-model.js?v=home-1';
import {api,el} from './api.js?v=members-1';
export function createHomepageEditor(root,{getShows,notify}){
 let version=0,sections=defaultHome(),busy=false,dirty=false;
 const heading=el('h2','메인 화면 편성'),hint=el('p','각 영역의 공연과 순서를 선택한 뒤 저장하세요. 비공개 공연은 방문자에게 표시되지 않습니다.','hint'),form=el('form'),panels=el('div',undefined,'home-panels'),save=el('button','메인 화면 저장','primary'),reload=el('button','저장된 설정 다시 불러오기','secondary'),status=el('p',undefined,'hint');
 save.type='submit';reload.type='button';const actions=el('div',undefined,'home-actions');actions.append(save,reload);form.append(panels,actions,status);root.append(heading,hint,form);
 function changed(){dirty=true;status.textContent='아직 저장하지 않은 변경 사항이 있습니다.';}
 function draw(){panels.replaceChildren();const shows=getShows();
  for(const {key,label,limit} of homeSections){
   const panel=el('section',undefined,'home-section');panel.dataset.section=key;const title=el('h3',label),modeLabel=el('label','표시 방식'),mode=el('select');mode.setAttribute('aria-label',label+' 표시 방식');
   for(const [value,text] of [['default','기본 구성 유지'],['custom','직접 선택']]){const o=el('option',text);o.value=value;mode.append(o);}mode.value=sections[key]===null?'default':'custom';modeLabel.append(mode);panel.append(title,modeLabel);
   if(sections[key]!==null){
    const controls=el('div',undefined,'home-add'),select=el('select'),add=el('button','공연 추가','secondary');select.setAttribute('aria-label',label+' 추가할 공연');const placeholder=el('option','공연을 선택하세요');placeholder.value='';select.append(placeholder);
    shows.filter(s=>s.published&&!sections[key].includes(s.id)).forEach(s=>{const o=el('option',s.title);o.value=s.id;select.append(o);});add.type='button';add.disabled=sections[key].length>=limit;
    add.addEventListener('click',()=>{if(select.value&&sections[key].length<limit){sections[key].push(select.value);changed();draw();}});controls.append(select,add);panel.append(controls);
    const list=el('ol',undefined,'home-selection');
    sections[key].forEach((id,index)=>{const s=shows.find(s=>s.id===id),row=el('li'),img=el('img');if(s)img.src=s.poster;img.alt='';const name=el('span',(s?.title||'삭제된 공연')+(s&&!s.published?' (비공개)':'')),buttons=el('div');
     for(const [text,label,offset] of [['↑','위로',-1],['↓','아래로',1],['삭제','삭제',0]]){const b=el('button',text,'secondary small');b.type='button';b.setAttribute('aria-label',(s?.title||id)+' '+label);b.disabled=(offset===-1&&index===0)||(offset===1&&index===sections[key].length-1);b.addEventListener('click',()=>{const ids=sections[key];if(offset)[ids[index],ids[index+offset]]=[ids[index+offset],ids[index]];else ids.splice(index,1);changed();draw();});buttons.append(b);}row.append(img,name,buttons);list.append(row);
    });panel.append(el('p',sections[key].length+' / '+limit+'개 · 위에서부터 표시 순서','hint'),list);if(!list.children.length)panel.append(el('p','공연을 추가하지 않으면 이 영역은 비어 있게 표시됩니다.','hint'));
   }else panel.append(el('p',key==='pick'?'공개 공연 전체를 표시합니다.':'현재 메인 페이지의 기본 구성을 유지합니다.','hint'));
   mode.addEventListener('change',()=>{sections[key]=mode.value==='default'?null:[];changed();draw();});panels.append(panel);
  }
 }
 async function load(){const data=await api('/api/admin/homepage');sections=data.sections;version=data.version;dirty=false;draw();status.textContent='저장된 설정을 불러왔습니다.';}
 reload.addEventListener('click',async()=>{if(dirty&&!confirm('저장하지 않은 변경을 버리고 다시 불러올까요?'))return;try{await load();}catch(e){notify(e.message,true);}});
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;panels.inert=true;save.disabled=reload.disabled=true;try{const data=await api('/api/admin/homepage',{method:'PUT',body:{sections,version}});sections=data.sections;version=data.version;dirty=false;draw();status.textContent='저장 완료 · 메인 페이지를 새로고침하면 반영됩니다.';notify('메인 화면 편성이 저장되었습니다.');}catch(e){notify(e.message,true);}finally{busy=false;panels.inert=false;save.disabled=reload.disabled=false;}});
 return {load,refresh:draw};
}
