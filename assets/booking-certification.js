import {api,el} from './api.js?v=certification-1';
import {API_BASE} from './config.js?v=members-1';
import {BOOKING_PHRASES,normalizePhrase} from './booking-phrases.js';
export function createBookingCertification(showId,{preview=false,canDefer=false}={}){
 let phrase='',challenge='',proof='',expires=0,issued=0,pending=false;
 const dialog=el('dialog',undefined,'booking-certification');dialog.setAttribute('aria-labelledby','certification-title');
 const title=el('h2','인증예매');title.id='certification-title';
 const form=el('form'),ment=el('p','부정예매 방지를 위해 보안문자를 정확히 입력해주세요.','certification-ment');
 const picture=el('div',undefined,'certification-picture'),canvas=el('canvas');canvas.width=560;canvas.height=160;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','인증예매 보안문자. 소리듣기로도 확인할 수 있습니다.');
 const controls=el('div',undefined,'certification-controls'),reload=el('button','↻'),audio=el('button','♪');reload.type=audio.type='button';reload.setAttribute('aria-label','새로고침');reload.title='새로고침';audio.setAttribute('aria-label','소리듣기');audio.title='소리듣기';reload.textContent='';audio.textContent='';
 const icon=(button,paths)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');for(const d of paths){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}button.append(svg);};
 icon(reload,['M20 7v5h-5','M19 12a7 7 0 1 0-2 5M20 7l-3-3']);icon(audio,['M4 9h4l5-4v14l-5-4H4z','M16 8q5 4 0 8','M19 5q8 7 0 14']);controls.append(reload,audio);picture.append(canvas,controls);
 const input=el('input');input.type='text';input.maxLength=30;input.autocomplete='off';input.spellcheck=false;input.placeholder='보안문자 입력';input.setAttribute('aria-label','보안문자 입력');
 const message=el('p',undefined,'certification-error');message.setAttribute('role','alert');message.hidden=true;
 const submit=el('button','입력완료','certification-submit');submit.type='submit';
 const later=el('button','좌석 먼저 확인하고 나중에 입력하기','certification-later');later.type='button';later.hidden=!canDefer;
 form.append(ment,picture,input,message,submit,later);dialog.append(title,form);document.body.append(dialog);
 function fail(text){message.textContent=text;message.hidden=!text;input.setAttribute('aria-invalid',String(!!text));}
 function draw(){const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,560,160);const size=Math.min(42,490/phrase.length);ctx.font=`bold ${size}px 'Malgun Gothic',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';[...phrase].forEach((char,i)=>{ctx.save();ctx.translate(30+(i+.5)*500/phrase.length,80+Math.sin(i*2)*5);ctx.rotate((i%3-1)*.045);ctx.fillStyle=['#49416b','#3e5263','#5a4057'][i%3];ctx.fillText(char,0,0);ctx.restore();});ctx.strokeStyle='#b1aab055';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(0,25+i*45);ctx.bezierCurveTo(180,110-i*20,370,15+i*30,560,45+i*25);ctx.stroke();}}
 function lock(value){pending=value;reload.disabled=submit.disabled=input.disabled=value;}
 async function refresh(){if(pending)return;lock(true);fail('');input.value='';try{if(API_BASE&&!preview){const result=await api('/api/booking-challenge',{method:'POST',body:{showId}});phrase=result.phrase;challenge=result.challenge;}else{const choices=BOOKING_PHRASES.filter(p=>p!==phrase);phrase=choices[crypto.getRandomValues(new Uint32Array(1))[0]%choices.length];}issued=Date.now();draw();}catch(e){phrase='';fail(e.message);}finally{lock(false);input.focus();}}
 async function open(){if(dialog.open)return;dialog.showModal();if(!phrase||Date.now()-issued>5*60*1000)await refresh();else input.focus();}
 reload.addEventListener('click',refresh);
 audio.addEventListener('click',()=>{if(!phrase)return;if(!('speechSynthesis' in window)){fail('이 브라우저는 소리듣기를 지원하지 않습니다.');return;}speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(phrase);utterance.lang='ko-KR';utterance.rate=.75;utterance.onerror=()=>fail('소리를 재생하지 못했습니다. 기기의 한국어 음성 설정을 확인해 주세요.');speechSynthesis.speak(utterance);});
 later.addEventListener('click',()=>{window.speechSynthesis?.cancel();dialog.close();});
 dialog.addEventListener('cancel',e=>e.preventDefault());
 form.addEventListener('submit',async e=>{e.preventDefault();if(pending||!phrase)return;lock(true);fail('');try{if(API_BASE&&!preview){const result=await api('/api/booking-challenge',{method:'POST',body:{action:'verify',showId,challenge,answer:input.value}});proof=result.proof;}else{if(normalizePhrase(input.value)!==phrase)throw new Error('문자를 정확히 입력해 주세요.');proof='preview';}expires=Date.now()+29*60*1000;window.speechSynthesis?.cancel();dialog.close();}catch(e){fail(e.message);input.select();}finally{lock(false);}});
 return {open,get proof(){return expires>Date.now()?proof:'';},async require(){if(expires>Date.now()&&proof)return true;proof='';await open();return false;},async reset(){proof='';expires=0;phrase='';await open();}};
}
