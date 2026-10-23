// Shared validation: browsers use the native DOMParser, the Edge Function supplies xmldom.
export function sanitizeMap(source,Parser=globalThis.DOMParser,Serializer=globalThis.XMLSerializer){
 if(typeof source!=='string'||source.length>200000||/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('SVG는 200KB 이하이며 외부 문서 선언을 포함할 수 없습니다.');
 const doc=new Parser().parseFromString(source,'image/svg+xml');
 if(!doc.documentElement||doc.documentElement.localName!=='svg'||doc.getElementsByTagName('parsererror').length)throw new Error('올바른 SVG 파일을 선택해 주세요.');
 const tags=new Set(['svg','g','path','rect','circle','ellipse','polygon','polyline','line','text','tspan','title','desc','defs','clipPath','linearGradient','radialGradient','stop']);
 const attrs=new Set(['id','viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','opacity','fill-opacity','stroke-opacity','transform','text-anchor','font-size','font-family','font-weight','dx','dy','dominant-baseline','preserveAspectRatio','clip-path','clipPathUnits','gradientUnits','gradientTransform','fx','fy','offset','stop-color','stop-opacity']);
 const safe=(k,v)=>!/[<>\\]|expression/i.test(v)&&(!/url\s*\(/i.test(v)||(['fill','stroke','clip-path'].includes(k)&&/^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/.test(v)));
 const rules=[];for(const style of Array.from(doc.getElementsByTagName('style'))){const re=/([^{}]+)\{([^{}]*)\}/g;let m;while((m=re.exec(style.textContent||''))){for(const selector of m[1].split(',')){const match=selector.trim().match(/^([.#]?)([A-Za-z_][\w-]*)$/);if(match)rules.push({kind:match[1],name:match[2],body:m[2]});}}}
 if(rules.length>1000)throw new Error('SVG 스타일 규칙이 너무 많습니다.');
 const ids=new Set();let count=0;
 function clean(node,depth=0){
  if(depth>32||++count>4000)throw new Error('SVG 도형이 너무 많거나 구조가 복잡합니다.');
  function declarations(body){for(const entry of body.split(';')){const i=entry.indexOf(':'),k=entry.slice(0,i).trim(),v=entry.slice(i+1).trim();if(i>0&&attrs.has(k)&&!['id','viewBox'].includes(k)&&safe(k,v))node.setAttribute(k,v);}}
  for(const rule of rules){if((rule.kind==='.'&&(node.getAttribute('class')||'').split(/\s+/).includes(rule.name))||(rule.kind==='#'&&node.getAttribute('id')===rule.name)||(!rule.kind&&node.localName===rule.name))declarations(rule.body);}
  for(const attr of Array.from(node.attributes||[])){
   if(attr.name==='style'){
    declarations(attr.value);
   }
   if(!attrs.has(attr.name)||!safe(attr.name,attr.value))node.removeAttribute(attr.name);
  }
  if(node.hasAttribute('id')&&(!/^[A-Za-z_][\w:.-]{0,100}$/.test(node.getAttribute('id'))||ids.has(node.getAttribute('id'))))node.removeAttribute('id');
  if(!node.hasAttribute('id'))node.setAttribute('id','map-part-'+count);
  ids.add(node.getAttribute('id'));
  for(const child of Array.from(node.childNodes)){
   if(child.nodeType===1){if(tags.has(child.localName)&&(!child.namespaceURI||child.namespaceURI==='http://www.w3.org/2000/svg'))clean(child,depth+1);else node.removeChild(child);}
   else if(child.nodeType!==3||!['text','tspan','title','desc'].includes(node.localName))node.removeChild(child);
  }
 }
 clean(doc.documentElement);
 const svg=doc.documentElement;svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
 if(!svg.getAttribute('viewBox')){const w=parseFloat(svg.getAttribute('width')),h=parseFloat(svg.getAttribute('height'));if(!(w>0&&h>0))throw new Error('SVG에 viewBox 또는 가로·세로 크기가 필요합니다.');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);}
 const vb=svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0||vb.some(v=>Math.abs(v)>1000000))throw new Error('SVG viewBox 크기를 확인해 주세요.');
 svg.removeAttribute('width');svg.removeAttribute('height');
 return new Serializer().serializeToString(svg);
}
export function validateSeatMap(raw,grades,{Parser,Serializer}={}){
 if(!raw)return null;
 const bad=m=>{throw Object.assign(new Error(m),{status:400});};
 if(typeof raw!=='object'||!Array.isArray(raw.zones)||raw.zones.length<1||raw.zones.length>80)bad('좌석 구역은 1~80개로 설정해 주세요.');
 let svg;try{svg=sanitizeMap(raw.svg,Parser,Serializer);}catch(e){bad(e.message);}
 const doc=new (Parser||globalThis.DOMParser)().parseFromString(svg,'image/svg+xml'),ids=new Set(Array.from(doc.getElementsByTagName('*')).map(n=>n.getAttribute('id')));
 const zoneIds=new Set(),seatIds=new Set(),elements=new Set();let total=0;
 const zones=raw.zones.map(z=>{
  if(!z||!/^[-\w]{1,80}$/.test(z.id)||zoneIds.has(z.id)||typeof z.name!=='string'||!z.name.trim()||z.name.length>50||!ids.has(z.elementId)||elements.has(z.elementId)||!Number.isInteger(z.rows)||z.rows<1||z.rows>80||!Number.isInteger(z.columns)||z.columns<1||z.columns>100||!Array.isArray(z.seats))bad('구역명·SVG 도형 연결·행과 열을 확인해 주세요.');
  zoneIds.add(z.id);elements.add(z.elementId);const positions=new Set(),labels=new Set();
  const seats=z.seats.map(s=>{
   if(!s||typeof s.id!=='string'||!/^[-\w]{1,100}$/.test(s.id)||seatIds.has(s.id)||!Number.isInteger(s.row)||s.row<1||s.row>z.rows||!Number.isInteger(s.col)||s.col<1||s.col>z.columns||positions.has(s.row+':'+s.col)||typeof s.number!=='string'||!s.number.trim()||s.number.length>20||labels.has(s.row+':'+s.number)||!grades.some(g=>g.id===s.gradeId))bad('좌석 위치·번호·등급이 올바르지 않거나 중복되었습니다.');
   seatIds.add(s.id);positions.add(s.row+':'+s.col);labels.add(s.row+':'+s.number);total++;
   return{id:s.id,row:s.row,col:s.col,number:s.number.trim(),gradeId:s.gradeId,blocked:s.blocked===true};
  });
  return{id:z.id,name:z.name.trim(),elementId:z.elementId,rows:z.rows,columns:z.columns,seats};
 });
 if(total<1||total>10000)bad('전체 좌석은 1~10,000개로 설정해 주세요.');
 return{svg,zones};
}
export function flattenSeats(map){return map?.zones.flatMap(z=>z.seats.map(s=>({...s,zoneId:z.id,zoneName:z.name})))||[];}
export function seatLabel(s){return `${s.zoneName}구역 ${s.row}열 ${s.number}번`;}
export function mapElement(source){const clean=sanitizeMap(source);return document.importNode(new DOMParser().parseFromString(clean,'image/svg+xml').documentElement,true);}
export function bindZones(svg,zones,onSelect,current){
 for(const z of zones){const shape=Array.from(svg.querySelectorAll('[id]')).find(n=>n.id===z.elementId);if(!shape)continue;shape.classList.add('map-zone');if(z.id===current)shape.classList.add('map-zone-current');shape.setAttribute('role','button');shape.setAttribute('tabindex','0');shape.setAttribute('aria-label',z.name+'구역');shape.addEventListener('click',e=>{e.stopPropagation();onSelect(z.id);});shape.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(z.id);}});}
}
