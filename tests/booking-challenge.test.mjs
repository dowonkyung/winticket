import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingChallenge} from '../supabase/functions/winticket-api/booking-challenge.js';
import {BOOKING_PHRASES} from '../assets/booking-phrases.js';
test('booking certification uses specified phrases, binds proof to member and show',async()=>{
 const service=await bookingChallenge('test-only-secret');
 const issued=await service.issue('member-session','show');assert.ok(BOOKING_PHRASES.includes(issued.phrase));
 assert.equal(await service.verify(issued.challenge,'wrong','member-session','show'),null);
 assert.equal(await service.verify(issued.challenge,issued.phrase,'other-member','show'),null);
 assert.equal(await service.verify(issued.challenge,issued.phrase,'member-session','other-show'),null);
 assert.equal(await service.valid(issued.challenge,'member-session','show'),false);
 const proof=await service.verify(issued.challenge,issued.phrase.normalize('NFD'),'member-session','show');assert.ok(proof);
 assert.equal(await service.valid(proof,'member-session','show'),true);
 assert.equal(await service.valid(proof,'member-session','other-show'),false);
 assert.equal(await service.valid(proof,'other-member','show'),false);
 assert.equal(await service.valid(proof+'x','member-session','show'),false);
 assert.equal(await (await bookingChallenge('different-key')).valid(proof,'member-session','show'),false);
 const now=Date.now;try{Date.now=()=>now()+31*60*1000;assert.equal(await service.valid(proof,'member-session','show'),false);assert.equal(await service.verify(issued.challenge,issued.phrase,'member-session','show'),null);}finally{Date.now=now;}
});
