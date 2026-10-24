import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApplication} from '../server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),work=path.dirname(root);
test('persistent admin catalog and reservation workflow',async t=>{
 const data=path.join(work,'test-data-'+randomUUID());await mkdir(data,{recursive:true});let app,origin;
 async function start(){app=await createApplication({dataDirectory:data,adminUsername:'qa_admin',adminPassword:'test-only-password-123'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+app.server.address().port;}
 await start();t.after(async()=>{await app.close();assert.ok(data.startsWith(work+path.sep));await rm(data,{recursive:true,force:true});});
 function client(){let cookie='',csrf='';return{async request(url,method='GET',body,extra={}){const headers={Origin:origin,...extra};if(cookie)headers.Cookie=cookie;if(method!=='GET'){headers['Content-Type']='application/json';headers['X-CSRF-Token']=csrf;}const response=await fetch(origin+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const result=await response.json();if(result.csrf)csrf=result.csrf;return{status:response.status,body:result,headers:response.headers};},async ready(){await this.request('/api/session');return this;}};}
 const admin=await client().ready(),guest=await client().ready();let show;
 const fixture={title:'테스트 공연 <b>원문</b>',category:'콘서트',poster:'assets/nct-wish-poster.jpg',detailImage:'',venue:'테스트 공연장',address:'테스트 주소',age:'전체관람가',duration:'90분',artist:'테스트 출연진',organizer:'테스트',description:'테스트 소개',notice:'결제 없는 신청',salesStart:'',maxTickets:2,published:true,exclusive:false,sessions:[{id:'first',date:'2090-01-15',time:'18:00'},{id:'second',date:'2090-01-16',time:'18:00'}],grades:[{id:'general',name:'일반석',price:50000,capacity:3,color:'#00cd3c'}]};
 await t.test('admin endpoints reject anonymous users and cross-origin writes',async()=>{
  assert.equal((await guest.request('/api/admin/shows')).status,401);
  assert.equal((await guest.request('/api/admin/shows','POST',fixture)).status,401);
  const r=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
  const noCsrf=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(noCsrf.status,403);
 });
 await t.test('login verifies password and sets protected session cookie',async()=>{
  assert.equal((await admin.request('/api/admin/login','POST',{username:'qa_admin',password:'wrong'})).status,401);
  const r=await admin.request('/api/admin/login','POST',{username:'qa_admin',password:'test-only-password-123'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
 });
 await t.test('admin creates a concert, public visitors see the same record',async()=>{
  const r=await admin.request('/api/admin/shows','POST',fixture);assert.equal(r.status,201);show=r.body.show;assert.ok(show.id);const publicShow=await guest.request('/api/shows/'+show.id);assert.equal(publicShow.body.show.title,fixture.title);assert.equal(publicShow.body.availability.first.general,3);assert.ok((await guest.request('/api/shows')).body.shows.some(s=>s.id===show.id));
 });
 await t.test('homepage selections require admin, persist order, reject stale saves and filter hidden shows',async()=>{
  assert.equal((await guest.request('/api/admin/homepage')).status,401);
  assert.equal((await guest.request('/api/admin/homepage','PUT',{})).status,401);
  const hidden=(await admin.request('/api/admin/shows','POST',{...fixture,title:'편성 비공개',published:false})).body.show;
  const home=await admin.request('/api/admin/homepage');assert.equal(home.body.sections.slider,null);
  const sections={slider:[show.id,hidden.id],international:[show.id],upcoming:[],weekly:[show.id],pick:[show.id]};
  let result=await admin.request('/api/admin/homepage','PUT',{sections,version:home.body.version});assert.equal(result.status,200);assert.deepEqual(result.body.sections,sections);
  const publicResult=await guest.request('/api/homepage');assert.deepEqual(publicResult.body.sections.slider,[show.id]);assert.deepEqual(publicResult.body.sections.upcoming,[]);
  assert.equal((await admin.request('/api/admin/homepage','PUT',{sections,version:home.body.version})).status,409);
  for(const invalid of [{...sections,pick:['missing']},{...sections,slider:[show.id,show.id]},{...sections,weekly:Array(6).fill(show.id)},{slider:[]}])assert.equal((await admin.request('/api/admin/homepage','PUT',{sections:invalid,version:result.body.version})).status,400);
  await app.close();await start();assert.deepEqual((await admin.request('/api/admin/homepage')).body.sections,sections);
 });
 await t.test('schema validation rejects malformed dates, prices and image paths',async()=>{
  for(const changes of [{sessions:[{date:'2090-02-30',time:'18:00'}]},{sessions:[{date:'2090-99-99',time:'25:00'}]},{poster:'javascript:alert(1)'},{grades:[{id:'x',name:'R',price:-1,capacity:3}]}])assert.equal((await admin.request('/api/admin/shows','POST',{...fixture,...changes})).status,400);
 });
 await t.test('overselling is blocked under concurrent requests',async()=>{
  const visitors=await Promise.all(Array.from({length:8},()=>client().ready()));const results=await Promise.all(visitors.map(c=>c.request('/api/reservations','POST',{showId:show.id,sessionId:'first',gradeId:'general',quantity:1,amount:0})));assert.equal(results.filter(r=>r.status===201).length,3);assert.equal(results.filter(r=>r.status===409).length,5);for(const r of results.filter(r=>r.status===201))assert.equal(r.body.reservation.amount,50000);assert.equal((await guest.request('/api/shows/'+show.id)).body.availability.first.general,0);
 });
 let reservation;
 await t.test('per-session quantity limits and owner-only cancellation',async()=>{
  let r=await guest.request('/api/reservations','POST',{showId:show.id,sessionId:'second',gradeId:'general',quantity:2});assert.equal(r.status,201);reservation=r.body.reservation;assert.equal(reservation.amount,100000);assert.equal((await guest.request('/api/reservations','POST',{showId:show.id,sessionId:'second',gradeId:'general',quantity:1})).status,409);
  const outsider=await client().ready();assert.equal((await outsider.request('/api/reservations/'+reservation.id+'/cancel','POST',{})).status,404);assert.equal((await outsider.request('/api/reservations')).body.reservations.length,0);assert.equal((await guest.request('/api/reservations')).body.reservations[0].id,reservation.id);
 });
 await t.test('edits protect existing bookings and reject stale versions',async()=>{
  assert.equal((await admin.request('/api/admin/shows/'+show.id,'PUT',{...show,version:0})).status,409);
  assert.equal((await admin.request('/api/admin/shows/'+show.id,'PUT',{...show,grades:[{...show.grades[0],capacity:1}]})).status,409);
  assert.equal((await admin.request('/api/admin/shows/'+show.id,'PUT',{...show,sessions:show.sessions.map(s=>({...s,date:'2090-02-01'}))})).status,400);
  assert.equal((await admin.request('/api/admin/shows/'+show.id,'PUT',{...show,sessions:show.sessions.map((s,i)=>({...s,date:i?'2090-02-02':'2090-02-01'}))})).status,409);
 });
 await t.test('cancellation restores inventory once',async()=>{
  assert.equal((await guest.request('/api/reservations/'+reservation.id+'/cancel','POST',{})).status,200);assert.equal((await guest.request('/api/shows/'+show.id)).body.availability.second.general,3);assert.equal((await guest.request('/api/reservations/'+reservation.id+'/cancel','POST',{})).status,409);
 });
 await t.test('unpublished concerts stay private and sales windows are enforced',async()=>{
  let r=await admin.request('/api/admin/shows','POST',{...fixture,published:false});const hidden=r.body.show;assert.equal((await guest.request('/api/shows/'+hidden.id)).status,404);assert.equal((await admin.request('/api/shows/'+hidden.id)).status,200);assert.ok(!(await guest.request('/api/shows')).body.shows.some(s=>s.id===hidden.id));
  r=await admin.request('/api/admin/shows','POST',{...fixture,salesStart:'2090-01-01T20:00'});assert.equal((await guest.request('/api/reservations','POST',{showId:r.body.show.id,sessionId:'first',gradeId:'general',quantity:1})).status,409);
  r=await admin.request('/api/admin/shows','POST',{...fixture,sessions:[{id:'past',date:'2020-01-01',time:'18:00'}]});assert.equal((await guest.request('/api/reservations','POST',{showId:r.body.show.id,sessionId:'past',gradeId:'general',quantity:1})).status,409);
 });
 await t.test('uploads verify image signatures and keep source and database private',async()=>{
  assert.equal((await guest.request('/api/admin/uploads','POST',{base64:'aGVsbG8='})).status,401);assert.equal((await admin.request('/api/admin/uploads','POST',{base64:'aGVsbG8='})).status,400);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xkAAAAASUVORK5CYII=';const r=await admin.request('/api/admin/uploads','POST',{base64:png});assert.equal(r.status,201);const response=await fetch(origin+r.body.url);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  for(const p of ['/server.mjs','/data/winticket.sqlite','/.env','/.git/config','/tests/server.test.mjs'])assert.equal((await fetch(origin+p)).status,404);
 });
 await t.test('venue selection snapshots canonical data, updates linked shows, and show deletion preserves bookings',async()=>{
  const visitor=await client().ready();
  assert.equal((await visitor.request('/api/admin/venues')).status,401);assert.equal((await visitor.request('/api/admin/venues','POST',{name:'blocked'})).status,401);
  const venuePayload={name:'새 공연장',logo:'assets/nct-wish-poster.jpg',address:'서울 테스트로 1',phone:'02-123-4567',website:'https://example.com',mapUrl:'<iframe src="https://www.google.com/maps/embed?x=1&amp;y=2"></iframe>'};
  let r=await admin.request('/api/admin/venues','POST',venuePayload);assert.equal(r.status,201);const venue=r.body.venue;assert.equal(venue.mapUrl,'https://www.google.com/maps/embed?x=1&y=2');
  assert.equal((await admin.request('/api/admin/venues','POST',{...venuePayload,mapUrl:'javascript:alert(1)'})).status,400);
  assert.equal((await admin.request('/api/admin/shows','POST',{...fixture,venueId:'missing'})).status,400);
  r=await admin.request('/api/admin/shows','POST',{...fixture,title:'공연장 연계',poster:'assets/venue-test-poster.jpg',venueId:venue.id,venue:'forged',address:'forged'});assert.equal(r.status,201);let linked=r.body.show;assert.equal(linked.venue,'새 공연장');assert.equal(linked.address,venue.address);assert.equal(linked.venueImage,venue.logo);
  const reservationResult=await visitor.request('/api/reservations','POST',{showId:linked.id,sessionId:'first',gradeId:'general',quantity:1});assert.equal(reservationResult.status,201);
  const changed=await admin.request('/api/admin/venues/'+venue.id,'PUT',{...venue,phone:'02-000-0000'});assert.equal(changed.status,200);
  assert.equal((await admin.request('/api/admin/venues/'+venue.id,'PUT',{...venue,phone:'stale'})).status,409);
  linked=(await visitor.request('/api/shows/'+linked.id)).body.show;assert.equal(linked.venuePhone,'02-000-0000');assert.equal(linked.version,2);
  assert.equal((await visitor.request('/api/admin/shows/'+linked.id+'/delete','POST',{version:linked.version})).status,401);
  assert.equal((await admin.request('/api/admin/shows/'+linked.id+'/delete','POST',{version:1})).status,409);
  r=await admin.request('/api/admin/shows/'+linked.id+'/delete','POST',{version:linked.version});assert.equal(r.status,200);const deleted=r.body.show;assert.equal(deleted.published,false);
  assert.equal((await visitor.request('/api/shows/'+linked.id)).status,404);assert.equal((await visitor.request('/api/reservations','POST',{showId:linked.id,sessionId:'first',gradeId:'general',quantity:1})).status,400);
  const catalog=(await visitor.request('/api/shows')).body;assert.ok(!catalog.shows.some(x=>x.id===linked.id));assert.ok(catalog.retiredPosters.includes('assets/venue-test-poster.jpg'));
  const adminCatalog=(await admin.request('/api/admin/shows')).body;assert.ok(!adminCatalog.shows.some(x=>x.id===linked.id));assert.ok(adminCatalog.deletedShows.some(x=>x.id===linked.id));
  assert.equal((await visitor.request('/api/reservations')).body.reservations[0].id,reservationResult.body.reservation.id);
  assert.equal((await admin.request('/api/admin/shows/'+linked.id,'PUT',deleted)).status,409);
  await app.close();await start();assert.ok((await admin.request('/api/admin/shows')).body.deletedShows.some(x=>x.id===linked.id));
  r=await admin.request('/api/admin/shows/'+linked.id+'/restore','POST',{version:deleted.version});assert.equal(r.status,200);assert.equal(r.body.show.published,true);assert.equal((await visitor.request('/api/shows/'+linked.id)).body.availability.first.general,2);
 });
 await t.test('catalog and reservations survive a restart',async()=>{await app.close();await start();assert.equal((await guest.request('/api/shows/'+show.id)).body.show.title,fixture.title);assert.equal((await guest.request('/api/reservations')).body.reservations[0].status,'cancelled');assert.equal((await admin.request('/api/admin/reservations')).status,200);});
 await t.test('logout revokes administrator access',async()=>{assert.equal((await admin.request('/api/admin/logout','POST',{})).status,200);assert.equal((await admin.request('/api/admin/shows')).status,401);});
 await t.test('guest history survives administrator login and logout in the same browser',async()=>{assert.equal((await guest.request('/api/admin/login','POST',{username:'qa_admin',password:'test-only-password-123'})).status,200);assert.equal((await guest.request('/api/reservations')).body.reservations[0].id,reservation.id);await guest.request('/api/admin/logout','POST',{});assert.equal((await guest.request('/api/reservations')).body.reservations[0].id,reservation.id);});
});
