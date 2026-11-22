'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

// The Playwright preview is a copy of index.html. Always mock the *same*
// Supabase origin as the application under test; never send fixture tokens
// or OTPs to a real project because a test route targets the wrong backend.
function mockSupabaseOrigin(){
 const html=fs.readFileSync(path.join(__dirname,'..','dist','index.html'),'utf8');
 const match=html.match(/const SUPABASE_URL=['"](https:\/\/[a-z0-9]+\.supabase\.co)['"]/);
 assert.ok(match,'Expected pinned Supabase URL in dist/index.html');
 const origin=new URL(match[1]).origin;
 const known=new Set([
  'https://flcfqwndqfmbritaywfb.supabase.co',
  'https://lvomrcqytfygcmguojcj.supabase.co'
 ]);
 assert.ok(known.has(origin),'Unexpected Supabase test target: refusing to run');
 return origin;
}
module.exports={mockSupabaseOrigin};
