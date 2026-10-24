import {validateSeatMap,flattenSeats} from './seat-model.js';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function validateSeatTemplate(raw,id,xml={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100||typeof raw.venueId!=='string'||!/^[-\w]{1,80}$/.test(raw.venueId)||!Array.isArray(raw.grades)||!raw.grades.length||raw.grades.length>20)fail('공연장·양식 이름·좌석등급을 확인해 주세요.');
 const ids=new Set();const grades=raw.grades.map(g=>{if(!g||typeof g.id!=='string'||!/^[-\w]{1,80}$/.test(g.id)||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>80||!Number.isInteger(g.price)||g.price<0||g.price>10000000||typeof g.color!=='string'||!/^#[a-f0-9]{6}$/i.test(g.color))fail('좌석등급의 이름·가격·색상을 확인해 주세요.');ids.add(g.id);return {id:g.id,name:g.name.trim(),price:g.price,color:g.color.toLowerCase(),capacity:0};});
 const seatMap=validateSeatMap(raw.seatMap,grades,xml);if(!seatMap)fail('SVG 구역도와 좌석을 먼저 설정해 주세요.');const seats=flattenSeats(seatMap);for(const g of grades)g.capacity=seats.filter(s=>s.gradeId===g.id&&!s.blocked).length;
 return {id,venueId:raw.venueId,name:raw.name.trim(),grades,seatMap};
}
export function templateSummary(t){const {seatMap,...summary}=t;return {...summary,seatCount:flattenSeats(seatMap).filter(s=>!s.blocked).length,zoneCount:seatMap.zones.length};}
