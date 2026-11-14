'use strict';
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
function section(from,to){
  const i=js.indexOf(from),j=js.indexOf(to,i+from.length);
  assert.ok(i>=0&&j>i,'Missing section '+from);
  return js.slice(i,j);
}
const claimCode=section('let pendingCloudUsername=', 'async function login(){');

function harness({initialName=null,profile={u:'OldAlias',nick:'Old Name',tasks:[{id:'a'}]}, failClaim=null, conflict=false}={}){
  const state={reserved:initialName,remote:structuredClone(profile),calls:[],pushes:0,saves:[],greetings:0};
  const identity={access_token:'token',refresh_token:'refresh',user:{
    id:'00000000-0000-0000-0000-000000000001',email:'test@example.com',
    user_metadata:{},app_metadata:{providers:['google']}
  }};
  const session={user:identity.user};
  const injected=new Function('state','identity','session','conflict','failClaim',`
    let A=null,view='login',msg='',loginDat={u:'',p:''};
    const DB={accounts:{}},userRe=/^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{3,20}$/;
    const tr=()=>true,t=()=> 'Bu kullanıcı adı alınmış.';
    const sbSave=()=>{},sbClear=()=>{};
    const sbSession=()=>session;
    const sbPull=async()=>structuredClone(state.remote);
    const sb=async (path,opt)=>{
      state.calls.push(path);
      if(path.includes('iydu_my_username'))return state.reserved;
      if(path.includes('iydu_set_username')){
        if(failClaim)throw failClaim;
        state.reserved=opt.body.p_username;
        state.remote.u=state.reserved;
        return null;
      }
      throw Error('Unexpected RPC '+path);
    };
    const norm=x=>x,cacheCloudAccount=a=>{DB.accounts[a.u]=a};
    const cachedUsernameConflict=()=>conflict;
    const v13ProtectLegacyCollision=()=>{};
    const restorePomodoroState=()=>{},applyTheme=()=>{};
    const save=opts=>state.saves.push(opts);
    const goTo=v=>{view=v},sbPush=async()=>{state.pushes++;return true};
    const warnCloudSyncFailure=()=>{};
    const renderAppOrAuth=()=>{},greetThen=()=>{state.greetings++};
    const document={getElementById:id=>id==='claim-name'?{value:'NewGoogle',isConnected:true}:null};
    ${claimCode}
    return {
      activateCloudUser,claimCloudUsername,cancelCloudUsernameClaim,
      cloudReservedUsername,identity,
      get:()=>({A,view,msg,pending:pendingCloudUsername,draft:claimDraftName})
    };
  `)(state,identity,session,conflict,failClaim);
  return {state,...injected};
}

test('cloud account without reservation is held at username-claim screen without syncing guessed identity',async()=>{
  const h=harness();
  const result=await h.activateCloudUser(h.identity,'','google');
  assert.equal(result,null);
  assert.equal(h.get().view,'claim-username');
  assert.equal(h.get().A,null);
  assert.equal(h.state.pushes,0);
  assert.equal(h.state.saves.length,0);
  assert.equal(h.state.remote.u,'OldAlias');
  assert.ok(h.get().pending);
});

test('claim commits server identity first and preserves tasks on activation',async()=>{
  const h=harness();
  await h.activateCloudUser(h.identity,'','google');
  await h.claimCloudUsername();
  assert.equal(h.state.reserved,'NewGoogle');
  assert.equal(h.state.remote.u,'NewGoogle');
  assert.equal(h.get().A.u,'NewGoogle');
  assert.deepEqual(h.get().A.tasks,[{id:'a'}]);
  assert.equal(h.state.pushes,0,'Loading existing cloud data must not upload a whole JSON snapshot');
  assert.deepEqual(h.state.saves,[{skipCloudPush:true}]);
  assert.equal(h.get().view,'app');
  assert.equal(h.get().pending,null);
  assert.equal(h.state.greetings,1);
});

test('duplicate claim keeps pending session and does not enter the app',async()=>{
  const h=harness({failClaim:Object.assign(new Error('duplicate key'),{code:'23505'})});
  await h.activateCloudUser(h.identity,'','google');
  await h.claimCloudUsername();
  assert.equal(h.get().A,null);
  assert.equal(h.get().view,'claim-username');
  assert.equal(h.get().msg,'Bu kullanıcı adı alınmış.');
  assert.ok(h.get().pending);
  assert.equal(h.state.remote.u,'OldAlias');
});

test('a cloud RPC failure never treats stale JSON username as a trusted reservation',async()=>{
  const h=harness();
  const source=claimCode.replace('if(name===null)return null;',"throw new Error('connection unavailable');");
  const attempt=new Function('sb','userRe',source+';return cloudReservedUsername;')(
    async()=>null,/^[a-z]{3,20}$/);
  await assert.rejects(attempt(),/connection unavailable/);
  assert.match(js,/const reserved=await cloudReservedUsername\(\)/);
  assert.match(js,/if\(!reserved\)[\s\S]*?return null;/);
});

test('page restore uses same authoritative reservation check as interactive sign-in',()=>{
  const src=section('async function restoreCloudOnLoad(){','function th(t){');
  assert.match(src,/await activateCloudUser\(/);
  assert.doesNotMatch(src,/cacheCloudAccount\(a\)/);
  assert.doesNotMatch(src,/if\(!remote\)await sbPush\(\)/);
});

test('legacy migration reads post-claim data as its compare-and-swap baseline',()=>{
  const src=section('async function v13FinishMigration(j){','/* ================= Auth + RLS-protected Supabase sync');
  assert.match(src,/const afterClaim=await sbPull\(\)/);
  assert.match(src,/const claimOnly=/);
  assert.match(src,/p_expected_data:afterClaim/);
});

test('browser session activation never schedules background upload on login',()=>{
  const source=section('const save=(options={})=>{','/* oturum:');
  let pushes=0;
  const save=new Function('A','DB','setItem','touchSession','schedulePush','LSK',source+';return save;')(
    null,{},()=>{},()=>{},()=>{pushes++},'b1');
  save({skipCloudPush:true});
  assert.equal(pushes,0);
  save();
  assert.equal(pushes,1);
});

test('claim username view is a keyboard-submittable form with cancel path',()=>{
  assert.match(html,/onsubmit="event\.preventDefault\(\);claimCloudUsername\(\)"/);
  assert.match(html,/id="claim-name"/);
  assert.match(html,/cancelCloudUsernameClaim\(\)/);
});
