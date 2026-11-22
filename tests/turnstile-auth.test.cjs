'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('turnstile-auth.js','utf8');
function fixture({enabled=true,width=320}={}){
 let now=1000000,current,callbacks;const events=[];
 const status={textContent:''};
 const node=()=>({isConnected:true,dataset:{iyduTurnstile:'login'},parentElement:{querySelector:()=>status},getBoundingClientRect:()=>({width}),scrollIntoView(){}});
 current=node();
 const ctx={window:{turnstile:{render(el,opts){callbacks=opts;events.push('render');return 'widget'},reset(){events.push('reset')},remove(){events.push('remove')}}},document:{querySelector:q=>q.startsWith('meta')?(enabled?{content:'public-test-key'}:null):current},Date:class extends Date{static now(){return now}},URL,Promise,Error,setTimeout,clearTimeout,tr:()=>false};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {api:ctx.window.IYTurnstile,events,status,options:()=>callbacks,solve:(token='one-use-proof')=>callbacks.callback(token),advance:ms=>now+=ms,replace(){current.isConnected=false;current=node();return current}};
}
test('only supported Supabase auth operations consume a CAPTCHA',()=>{
 const {api}=fixture();
 for(const path of ['/auth/v1/signup','/auth/v1/recover?redirect_to=x','/auth/v1/resend','/auth/v1/otp','/auth/v1/token?grant_type=password'])assert.equal(api.protects(path,'POST'),true,path);
 for(const path of ['/auth/v1/verify','/auth/v1/token?grant_type=refresh_token','/auth/v1/token?grant_type=pkce','/auth/v1/token?grant_type=id_token','/rest/v1/rpc/iydu_load'])assert.equal(api.protects(path,'POST'),false,path);
 assert.equal(api.protects('/auth/v1/signup','GET'),false);
});
test('a solved token is attached once to the REST payload and never reused',async()=>{
 const x=fixture();await x.api.mount();assert.equal(x.api.ready(),false);x.solve();assert.equal(x.api.ready(),true);
 const body={email:'person@example.invalid',gotrue_meta_security:{other:'preserved'}};
 const result=await x.api.protect('/auth/v1/signup','POST',body);
 assert.equal(result.gotrue_meta_security.captcha_token,'one-use-proof');assert.equal(result.gotrue_meta_security.other,'preserved');assert.equal(body.gotrue_meta_security.captcha_token,undefined);
 await assert.rejects(x.api.protect('/auth/v1/signup','POST',body),{code:'CAPTCHA_REQUIRED'});assert.deepEqual(x.events,['render','reset']);
});
test('expired proofs and callbacks from a replaced form cannot authorize requests',async()=>{
 const x=fixture();await x.api.mount();const old=x.options();x.solve();x.advance(240001);assert.equal(x.api.ready(),false);
 await x.api.mount(x.replace());old.callback('stale-proof');assert.equal(x.api.ready(),false);
 x.solve('fresh-proof');x.options()['expired-callback']();assert.equal(x.api.ready(),false);
});
test('small forms use compact rendering and provider errors block submission',async()=>{
 const x=fixture({width:260});await x.api.mount();assert.equal(x.options().size,'compact');assert.equal(x.options().appearance,'always');x.solve();x.options()['error-callback']();assert.equal(x.api.ready(),false);assert.match(x.status.textContent,/complete the Cloudflare/);
});
test('unconfigured environments preserve auth bodies and do not load the provider',async()=>{
 const x=fixture({enabled:false}),body={email:'test@example.invalid'};await x.api.mount();assert.equal(x.api.markup('login'),'');assert.equal(x.api.ready(),true);assert.equal(await x.api.protect('/auth/v1/signup','POST',body),body);assert.deepEqual(x.events,[]);
});
