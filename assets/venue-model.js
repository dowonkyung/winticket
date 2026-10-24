export const mapHosts=['www.google.com','maps.google.com','maps.google.co.kr','map.naver.com','maps.naver.com','m.map.naver.com','map.kakao.com','maps.kakao.com','www.openstreetmap.org'];
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
function text(v,max){if(typeof v!=='string'||v.length>max)fail('공연장 입력값의 형식과 길이를 확인해 주세요.');return v.trim();}
export function mapEmbedUrl(raw=''){
 let value=text(raw,6000);if(!value)return '';
 if(value.startsWith('<')){const match=value.match(/^<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>\s*<\/iframe>\s*$/is);if(!match)fail('iframe 코드 또는 지도 삽입 주소를 입력해 주세요.');value=match[2].replace(/&amp;/gi,'&');}
 let url;try{url=new URL(value);}catch{fail('공연장 위치 iframe 주소를 확인해 주세요.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!mapHosts.includes(url.hostname))fail('HTTPS 지도 삽입 주소를 사용해 주세요. Google 지도, 네이버 지도, 카카오맵, OpenStreetMap을 지원합니다.');
 if(value.length>4000)fail('지도 주소는 4,000자 이하로 입력해 주세요.');return url.href;
}
export function validateVenue(raw,id){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('공연장 정보를 확인해 주세요.');
 const v={id,name:text(raw.name,200),logo:text(raw.logo||'',1000),address:text(raw.address||'',300),phone:text(raw.phone||'',80),website:text(raw.website||'',500),mapUrl:mapEmbedUrl(raw.mapUrl||'')};
 if(!v.name)fail('공연장 이름을 입력해 주세요.');
 if(v.logo&&!/^(?:assets\/[\w.@-]+\.(?:png|jpe?g|webp)|\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp)|https:\/\/ahchwkcszyphbmppctbt\.supabase\.co\/storage\/v1\/object\/public\/winticket\/[a-f0-9]{32}\.(?:png|jpg|webp))$/.test(v.logo))fail('공연장 로고는 이미지 업로드를 사용해 주세요.');
 if(v.website){let url;try{url=new URL(v.website);}catch{fail('공연장 홈페이지 주소를 확인해 주세요.');}if(url.protocol!=='https:'||url.username||url.password)fail('공연장 홈페이지는 HTTPS 주소를 입력해 주세요.');v.website=url.href;}
 return v;
}
export function venueFields(v){return {venueId:v.id,venue:v.name,venueImage:v.logo,address:v.address,venuePhone:v.phone,venueWebsite:v.website,venueMapUrl:v.mapUrl,venueLat:'',venueLng:''};}
