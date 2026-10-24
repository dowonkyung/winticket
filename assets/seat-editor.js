import {resizeZone} from './seat-grid-model.js?v=templates-1';
import {el} from './api.js?v=members-1';
import {sanitizeMap,mapElement,flattenSeats} from './seat-model.js?v=seats-1';
export function createSeatEditor(root,{getGrades,onError,idPrefix='',previewEnabled=true}){
 let map=null,current='',history=[],resizeBase=null,resizeRemembered=false;
 root.innerHTML=`<h3>지정좌석 · SVG 구역도</h3><p class="hint">SVG 구역도에서 도형을 구역에 연결하고, 구역별 행·열과 좌석을 설정합니다. 행·열을 바꾸면 배치가 바로 반영되며 기존 범위의 좌석·통로·번호·등급은 유지합니다. 축소한 배치는 되돌리기로 복구할 수 있습니다. 지정좌석을 사용하면 등급별 수량은 실제 판매 가능한 좌석 수로 자동 계산됩니다.</p><label class="seat-use"><input type="checkbox" id="use-assigned"> 지정좌석 사용</label><div id="seat-editor-body" hidden><div class="seat-editor-actions"><label class="secondary">SVG 구역도 업로드<input id="map-upload" type="file" accept="image/svg+xml,.svg"></label><button type="button" id="map-sample" class="secondary">예시 구역도로 시작</button><a href="assets/seat-map-template.svg" download class="secondary">SVG 양식 내려받기</a><button type="button" id="seat-preview" class="secondary">예매창 미리보기</button><a id="seat-preview-link" class="secondary" target="_blank" rel="noopener" hidden>미리보기 열기 ↗</a></div><p id="seat-editor-summary" class="hint"></p><div class="seat-config-columns"><div><div id="editor-map" class="editor-map"></div><p class="hint">구역을 선택한 뒤 도형을 누르면 연결됩니다. 또는 아래 SVG 도형 목록에서 선택하세요.</p><div class="zone-edit-fields"><label>구역<select id="zone-select"></select></label><button type="button" id="zone-add" class="secondary">구역 추가</button><button type="button" id="zone-delete" class="secondary">구역 삭제</button><label>구역명<input id="zone-name" maxlength="50"></label><label>SVG 도형<select id="zone-element"></select></label><label>기본 좌석등급<select id="zone-grade"></select></label><label>행 수<input id="zone-rows" type="number" min="1" max="80" value="21"></label><label>열 수<input id="zone-cols" type="number" min="1" max="100" value="28"></label></div><div class="seat-editor-actions"><button type="button" id="grid-full" class="secondary">직사각형 좌석 생성</button><button type="button" id="grid-triangle" class="secondary">사선형 좌석 생성</button><button type="button" id="grid-undo" class="secondary">좌석 편집 되돌리기</button></div></div><div><div class="seat-paint-tools"><label>편집 도구<select id="seat-tool"><option value="toggle">좌석 ↔ 통로</option><option value="block">판매 가능 ↔ 제외</option><option value="grade">선택 등급으로 칠하기</option><option value="number">좌석 번호 변경</option></select></label><label>변경할 번호<input id="seat-number" maxlength="20" value="1"></label></div><p class="hint">좌석을 클릭하거나 드래그해 편집하세요. 회색 점은 통로이며, 빗금은 판매 제외 좌석입니다. 번호는 같은 열 안에서 중복될 수 없습니다.</p><div class="editor-grid-scroll"><div id="editor-grid" class="editor-grid"></div></div></div></div></div>`;
 for(const n of root.querySelectorAll('[id]'))n.id=idPrefix+n.id;
 const $=id=>root.querySelector('#'+idPrefix+id),zone=()=>map?.zones.find(z=>z.id===current);
 if(!previewEnabled){$('seat-preview').hidden=true;$('seat-preview-link').hidden=true;}
 function remember(){history.push(JSON.stringify(map));if(history.length>30)history.shift();}
 function options(select,values,value){select.replaceChildren(...values.map(([id,name])=>{const o=el('option',name);o.value=id;return o;}));if(value!==undefined)select.value=value;}
 function paintMap(){const target=$('editor-map');target.replaceChildren();if(!map?.svg){target.append(el('p','SVG 파일을 업로드하거나 예시 구역도를 선택해 주세요.'));return;}const svg=mapElement(map.svg);svg.setAttribute('aria-label','관리자 구역도');for(const shape of svg.querySelectorAll('[id]')){if(!['g','path','rect','polygon','circle','ellipse'].includes(shape.localName))continue;shape.classList.add('editor-map-part');shape.addEventListener('click',e=>{if(!zone())return;e.stopPropagation();if(map.zones.some(z=>z.id!==current&&z.elementId===shape.id)){onError('이미 다른 구역에 연결된 도형입니다.');return;}remember();zone().elementId=shape.id;render();});}for(const z of map.zones){const shape=Array.from(svg.querySelectorAll('[id]')).find(s=>s.id===z.elementId);if(shape)shape.classList.add(z.id===current?'map-zone-current':'map-zone-linked');}target.append(svg);}
 function refreshGrades(){const old=$('zone-grade').value;options($('zone-grade'),getGrades().map(g=>[g.id,g.name||'이름 없는 등급']),old||getGrades()[0]?.id);}
 function render(){
  $('seat-editor-body').hidden=!$('use-assigned').checked;
  if(!map)return;
  if(!zone())current=map.zones[0]?.id||'';
  const z=zone();options($('zone-select'),map.zones.map(z=>[z.id,z.name]),current);refreshGrades();
  const doc=map.svg?mapElement(map.svg):null;
  options($('zone-element'),[['','연결할 도형을 선택하세요'],...(doc?Array.from(doc.querySelectorAll('[id]')).filter(s=>['g','path','rect','polygon','circle','ellipse'].includes(s.localName)).map(s=>[s.id,s.id+' ('+s.localName+')']):[])],z?.elementId||'');
  $('zone-name').value=z?.name||'';$('zone-rows').value=z?.rows||21;$('zone-cols').value=z?.columns||28;
  for(const id of ['zone-name','zone-element','zone-rows','zone-cols','zone-delete','grid-full','grid-triangle'])$(id).disabled=!z;
  resizeBase=null;resizeRemembered=false;
  const seats=flattenSeats(map);$('seat-editor-summary').textContent=`${map.zones.length}개 구역 · 판매 좌석 ${seats.filter(s=>!s.blocked).length.toLocaleString()}석 · 판매 제외 ${seats.filter(s=>s.blocked).length}석`;
  paintMap();drawGrid();
 }
 function drawGrid(){const target=$('editor-grid');target.replaceChildren();const z=zone();if(!z){target.append(el('p','구역을 추가해 주세요.'));return;}target.style.gridTemplateColumns=`32px repeat(${z.columns},24px)`;
  const cells=new Map(z.seats.map(s=>[s.row+':'+s.col,s]));
  for(let r=1;r<=z.rows;r++){target.append(el('span',r,'editor-row-label'));for(let c=1;c<=z.columns;c++){const b=el('button');b.type='button';b.dataset.row=r;b.dataset.col=c;updateCell(b,cells.get(r+':'+c));target.append(b);}}
 }
 function updateCell(b,s){b.className='editor-cell'+(!s?' aisle':s.blocked?' blocked':'');b.textContent=s?.number||'·';b.style.setProperty('--seat-color',getGrades().find(g=>g.id===s?.gradeId)?.color||'#bea886');b.setAttribute('aria-label',`${b.dataset.row}열 ${b.dataset.col}칸 ${s?s.blocked?'판매 제외 '+s.number+'번':s.number+'번':'통로'}`);}
 function applyCell(b){resizeBase=null;resizeRemembered=false;const z=zone();if(!z)return;const row=Number(b.dataset.row),col=Number(b.dataset.col),i=z.seats.findIndex(s=>s.row===row&&s.col===col),s=z.seats[i],tool=$('seat-tool').value,gradeId=$('zone-grade').value||getGrades()[0]?.id;
  if(!gradeId){onError('먼저 좌석등급을 추가해 주세요.');return;}
  if(tool==='toggle'){if(s)z.seats.splice(i,1);else z.seats.push({id:z.id+'-'+row+'-'+col,row,col,number:String(col),gradeId,blocked:false});}
  if(s&&tool==='block')s.blocked=!s.blocked;
  if(s&&tool==='grade')s.gradeId=gradeId;
  if(s&&tool==='number')s.number=$('seat-number').value.trim()||String(col);
  updateCell(b,z.seats.find(s=>s.row===row&&s.col===col));$('seat-editor-summary').textContent=`${map.zones.length}개 구역 · 판매 좌석 ${flattenSeats(map).filter(s=>!s.blocked).length.toLocaleString()}석`;
 }
 let dragging=false,visited=new Set();
 $('editor-grid').addEventListener('pointerdown',e=>{const b=e.target.closest('.editor-cell');if(!b)return;e.preventDefault();remember();dragging=true;visited=new Set([b]);applyCell(b);});
 $('editor-grid').addEventListener('pointerover',e=>{const b=e.target.closest('.editor-cell');if(dragging&&e.buttons===1&&b&&!visited.has(b)){visited.add(b);applyCell(b);}});
 window.addEventListener('pointerup',()=>{dragging=false;});
 $('editor-grid').addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&e.target.matches('.editor-cell')){e.preventDefault();remember();applyCell(e.target);}});
 $('use-assigned').addEventListener('change',()=>{if(!map)map={svg:'',zones:[]};render();});
 $('zone-select').addEventListener('change',()=>{current=$('zone-select').value;render();});
 $('zone-name').addEventListener('change',()=>{if(zone()){remember();zone().name=$('zone-name').value.trim();render();}});
 $('zone-element').addEventListener('change',()=>{const value=$('zone-element').value;if(map.zones.some(z=>z.id!==current&&z.elementId===value)){onError('이미 다른 구역에 연결된 도형입니다.');render();return;}remember();zone().elementId=value;paintMap();});
 $('zone-add').addEventListener('click',()=>{remember();const z={id:crypto.randomUUID(),name:String.fromCharCode(65+map.zones.length),elementId:'',rows:21,columns:28,seats:[]};map.zones.push(z);current=z.id;render();});
 $('zone-delete').addEventListener('click',()=>{remember();map.zones=map.zones.filter(z=>z.id!==current);current='';render();});
 function generate(triangle){const z=zone(),rows=Number($('zone-rows').value),columns=Number($('zone-cols').value),gradeId=$('zone-grade').value||getGrades()[0]?.id;if(!z||!gradeId||!Number.isInteger(rows)||rows<1||rows>80||!Number.isInteger(columns)||columns<1||columns>100){onError('행 1~80, 열 1~100 및 좌석등급을 확인해 주세요.');return;}remember();z.rows=rows;z.columns=columns;z.layout=triangle?'triangle':'rectangle';const previous=new Map(z.seats.map(s=>[s.row+':'+s.col,s]));z.seats=[];for(let row=1;row<=rows;row++){const start=triangle?Math.max(1,Math.round(columns*(1-Math.min(1,(row-1)/Math.max(1,rows*.6))))):1;for(let col=start;col<=columns;col++)z.seats.push(previous.get(row+':'+col)||{id:z.id+'-'+row+'-'+col,row,col,number:String(col),gradeId,blocked:false});}render();}

 function dimensions(commit=false){const z=zone();if(!z)return;const rows=Number($('zone-rows').value),columns=Number($('zone-cols').value),gradeId=$('zone-grade').value||getGrades()[0]?.id;
  if(!Number.isInteger(rows)||rows<1||rows>80||!Number.isInteger(columns)||columns<1||columns>100||!gradeId){if(commit)throw new Error('행 1~80, 열 1~100 및 좌석등급을 확인해 주세요.');return;}
  if(rows===z.rows&&columns===z.columns)return;
  if(!resizeBase||resizeBase.id!==z.id){resizeBase=structuredClone(z);resizeRemembered=false;}
  if(!resizeRemembered){remember();resizeRemembered=true;}
  const next=resizeZone(resizeBase,rows,columns,gradeId);Object.assign(z,next);drawGrid();const seats=flattenSeats(map);$('seat-editor-summary').textContent=map.zones.length+'개 구역 · 판매 좌석 '+seats.filter(s=>!s.blocked).length.toLocaleString()+'석 · 판매 제외 '+seats.filter(s=>s.blocked).length+'석';
 }
 for(const id of ['zone-rows','zone-cols']){
  $(id).addEventListener('focus',()=>{resizeBase=zone()?structuredClone(zone()):null;resizeRemembered=false;});
  $(id).addEventListener('input',()=>dimensions());
  $(id).addEventListener('change',()=>{try{dimensions(true);}catch(e){onError(e.message);$('zone-rows').value=zone()?.rows||21;$('zone-cols').value=zone()?.columns||28;}resizeBase=null;resizeRemembered=false;});
 }

 $('grid-full').addEventListener('click',()=>generate(false));$('grid-triangle').addEventListener('click',()=>generate(true));
 $('grid-undo').addEventListener('click',()=>{if(history.length){map=JSON.parse(history.pop());render();}});
 $('map-upload').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw new Error('SVG는 200KB 이하로 업로드해 주세요.');const svg=sanitizeMap(await file.text());remember();map={svg,zones:[]};current='';render();}catch(e){onError(e.message);}e.target.value='';});
 $('map-sample').addEventListener('click',async()=>{try{const r=await fetch('assets/seat-map-template.svg');if(!r.ok)throw new Error('예시 구역도를 읽지 못했습니다.');const svg=sanitizeMap(await r.text());remember();map={svg,zones:[]};for(const name of ['A','B','C','D','X','Y','Z'])map.zones.push({id:'zone-'+name,name,elementId:'zone-'+name,rows:21,columns:28,seats:[]});current=map.zones[0].id;render();generate(true);}catch(e){onError(e.message);}});
 return{load(value){history=[];map=value?structuredClone(value):null;current=map?.zones[0]?.id||'';$('use-assigned').checked=!!value;render();},value(){if($('use-assigned').checked)dimensions(true);return $('use-assigned').checked?structuredClone(map):null;},refreshGrades,previewButton:$('seat-preview'),previewLink:$('seat-preview-link')};
}
