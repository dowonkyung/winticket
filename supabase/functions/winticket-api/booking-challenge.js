import {BOOKING_PHRASES,normalizePhrase} from '../../../assets/booking-phrases.js';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export async function bookingChallenge(secret){
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('winticket-booking:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
 async function seal(data){const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(data))));return encode(iv)+'.'+encode(bytes);}
 async function open(token,kind,member,show){try{if(typeof token!=='string'||token.length>2048)return null;const parts=token.split('.');if(parts.length!==2)return null;const data=JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(parts[0])},key,decode(parts[1]))));return data.kind===kind&&data.member===member&&data.show===show&&data.expires>Date.now()?data:null;}catch{return null;}}
 return {
  async issue(member,show){const index=crypto.getRandomValues(new Uint32Array(1))[0]%BOOKING_PHRASES.length;return {phrase:BOOKING_PHRASES[index],challenge:await seal({kind:'challenge',member,show,index,expires:Date.now()+5*60*1000})};},
  async verify(token,answer,member,show){const data=await open(token,'challenge',member,show);if(!data||normalizePhrase(answer)!==BOOKING_PHRASES[data.index])return null;return seal({kind:'proof',member,show,expires:Date.now()+30*60*1000});},
  async valid(token,member,show){return !!await open(token,'proof',member,show);}
 };
}
