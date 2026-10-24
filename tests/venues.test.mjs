import test from 'node:test';import assert from 'node:assert/strict';import {mapEmbedUrl,validateVenue} from '../assets/venue-model.js';
test('venue iframe input extracts only a validated HTTPS map URL',()=>{
 assert.equal(mapEmbedUrl('<iframe src="https://www.google.com/maps/embed?x=1&amp;y=2" width="600"></iframe>'),'https://www.google.com/maps/embed?x=1&y=2');
 for(const value of ['javascript:alert(1)','https://www.google.com.evil.example/maps','https://user:pass@www.google.com/maps','https://localhost/map','https://www.google.com:8443/maps','<script>alert(1)</script>','<iframe src="https://evil.example"></iframe>'])assert.throws(()=>mapEmbedUrl(value));
 assert.throws(()=>validateVenue({name:'공연장',logo:'https://evil.example/logo.png'},'id'));assert.equal(validateVenue({name:'공연장',mapUrl:''},'id').name,'공연장');
});
