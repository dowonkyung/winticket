export const homeSections=[
 {key:'slider',label:'메인 페이지 슬라이더',limit:20,selector:'#sliderInner'},
 {key:'international',label:'내한공연',limit:5,selector:'#MAIN_B_CO_3'},
 {key:'upcoming',label:'오픈예정공연',limit:5,selector:'#MAIN_B_CO_2'},
 {key:'weekly',label:'이 주의 추천공연',limit:5,selector:'#MAIN_B_CO_1'},
 {key:'pick',label:'윈트티켓 PICK! 추천공연',limit:40,selector:'#perf_poster'}
];
export const defaultHome=()=>Object.fromEntries(homeSections.map(s=>[s.key,null]));
export function validateHome(raw,shows){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==5)fail('메인 화면 영역을 확인해 주세요.');
 const known=new Set(shows.map(s=>s.id)),result={};
 for(const {key,label,limit} of homeSections){const ids=raw[key];if(ids===null){result[key]=null;continue;}
  if(!Array.isArray(ids)||ids.length>limit||ids.some(id=>typeof id!=='string'||!known.has(id))||new Set(ids).size!==ids.length)fail(label+'의 공연 선택을 확인해 주세요.');result[key]=[...ids];
 }return result;
}
export function publicHome(sections,shows){const ids=new Set(shows.filter(s=>s.published).map(s=>s.id));return Object.fromEntries(homeSections.map(({key})=>[key,sections[key]===null?null:sections[key].filter(id=>ids.has(id))]));}
