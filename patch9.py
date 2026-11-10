# -*- coding: utf-8 -*-
"""asama 9: Supabase hesap + bulut senkron + Twilio telefon dogrulama.
   Yerel (localStorage) calisma AYNEN korunur; bulut varsa ustune biner."""
import io

p = 'deneme.html'
s = io.open(p, encoding='utf-8').read()


def rep(old, new, label):
    global s
    if old not in s:
        raise SystemExit('BULUNAMADI: ' + label)
    s = s.replace(old, new, 1)


# ------------------------------------------------------------------ 1) Supabase yapilandirmasi
rep("function applyTheme(){if(!A)return;document.documentElement.dataset.t=DB.beige?'beige':A.theme}",
"""/* ================= Supabase (bulut hesap + senkron) ================= */
const SUPABASE_URL='https://flcfqwndqfmbritaywfb.supabase.co';
const SUPABASE_KEY='sb_publishable_4QTEEc6tSYV2QtNhmeP6Iw_B3sM6dtm';
const CLOUD_KEY='b1cloud', SESS_KEY='b1sb';
const cloud=()=>{try{return localStorage.getItem(CLOUD_KEY)!=='0'}catch(e){return true}};
const sbSession=()=>{try{return JSON.parse(getItem(SESS_KEY)||'null')}catch(e){return null}};
function sbSave(sess){try{setItem(SESS_KEY,JSON.stringify(sess))}catch(e){}}
function sbClear(){try{setItem(SESS_KEY,'')}catch(e){}}
/* tek giris noktasi: token yenileme + hata yonetimi */
async function sb(path,opt){
  opt=opt||{};
  const sess=sbSession();
  const h=Object.assign({'apikey':SUPABASE_KEY,'Content-Type':'application/json'},opt.headers||{});
  if(sess&&sess.access_token&&!/^\\/auth\\/v1\\/(signup|token|otp)/.test(path))h['Authorization']='Bearer '+sess.access_token;
  const r=await fetch(SUPABASE_URL+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined});
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){
    const em=(j&&(j.msg||j.message||j.error_description||j.error))||('HTTP '+r.status);
    const err=new Error(em);err.status=r.status;err.code=j&&j.code;throw err;
  }
  return j;
}
/* e-posta/telefon -> supabase Auth */
const sbEmail=u=>(u.u||'')+'@iydu.app';
async function sbSignUp(u,pass,nick,phone){
  const body={email:sbEmail(u),password:pass,data:{username:u,nick:nick,phone:phone||''}};
  if(phone)body.phone=phone;
  return sb('/auth/v1/signup',{method:'POST',body});
}
async function sbSignIn(u,pass){
  const j=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email:sbEmail(u),password:pass}});
  if(j&&j.access_token)sbSave({access_token:j.access_token,refresh_token:j.refresh_token,user:j.user,at:Date.now()});
  return j;
}
async function sbRefresh(){
  const sess=sbSession();
  if(!sess||!sess.refresh_token)return false;
  try{
    const j=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:sess.refresh_token}});
    if(j&&j.access_token){sbSave({access_token:j.access_token,refresh_token:j.refresh_token,user:j.user,at:Date.now()});return true}
  }catch(e){}
  return false;
}
/* telefon: Supabase -> Twilio SMS */
async function sbPhoneStart(phone){
  const j=await sb('/auth/v1/otp',{method:'POST',body:{phone:phone,create_user:true}});
  return j;
}
async function sbPhoneVerify(phone,code,pass,nick,username){
  const j=await sb('/auth/v1/verify',{method:'POST',body:{phone:phone,token:code,type:'sms'}});
  if(j&&j.access_token)sbSave({access_token:j.access_token,refresh_token:j.refresh_token,user:j.user,at:Date.now()});
  return j;
}
/* bulut kaydi: kullanici basina tek satir (profil + tum uygulama verisi) */
async function sbPush(){
  if(!cloud()||!A||!sbSession())return false;
  try{
    const payload={p_username:A.u,p_nick:A.nick||A.u,p_data:JSON.parse(JSON.stringify(A))};
    await sb('/rest/v1/rpc/iydu_save',{method:'POST',body:payload});
    return true;
  }catch(e){
    if(e.status===401&&await sbRefresh()){try{await sb('/rest/v1/rpc/iydu_save',{method:'POST',body:{p_username:A.u,p_nick:A.nick||A.u,p_data:A}});return true}catch(_){}}
    return false;
  }
}
async function sbPull(u){
  if(!cloud()||!sbSession())return null;
  try{
    const rows=await sb('/rest/v1/rpc/iydu_load',{method:'POST',body:{p_username:u}});
    const row=Array.isArray(rows)?rows[0]:rows;
    if(!row||!row.data)return null;
    return row.data;
  }catch(e){return null}
}
/* ---- telefon (Twilio/Supabase) dogrulama: yeni hesap ---- */
let phoneDat={phone:'',code:'',step:1,busy:false,err:''};
function goPhone(){phoneDat={phone:formDat.t||'',code:'',step:1,busy:false,err:''};goTo('phone','home')}
async function phoneSend(){
  const ph=String(phoneDat.phone||'').replace(/[^0-9]/g,'');
  if(!/^[1-9][0-9]{9,14}$/.test(ph)){phoneDat.err=tr()?'Ülke kodlu numara gir (örn. 905551112233).':'Enter number with country code (e.g. 905551112233).';return renderAppOrAuth()}
  phoneDat.busy=true;phoneDat.err='';renderAppOrAuth();
  try{
    await sbPhoneStart('+'+ph);
    phoneDat.step=2;phoneDat.phone=ph;phoneDat.busy=false;
  }catch(e){phoneDat.busy=false;phoneDat.err=(tr()?'SMS gönderilemedi: ':'SMS failed: ')+e.message}
  renderAppOrAuth();
}
async function phoneCheck(){
  if(!/^[0-9]{6}$/.test(phoneDat.code||'')){phoneDat.err=tr()?'6 haneli kod gir.':'Enter the 6-digit code.';return renderAppOrAuth()}
  phoneDat.busy=true;phoneDat.err='';renderAppOrAuth();
  try{
    const u=$('#u')?$('#u').value.trim():'';
    const n=$('#n')?$('#n').value.trim():'';
    const pass=$('#p')?$('#p').value:'';
    if(!u||!pass){phoneDat.busy=false;phoneDat.err=tr()?'Önce kullanıcı adı ve şifre gir.':'Enter username and password first.';return renderAppOrAuth()}
    const bad=pwOk(pass,u);
    if(bad){phoneDat.busy=false;phoneDat.err=bad;return renderAppOrAuth()}
    await sbPhoneVerify('+'+phoneDat.phone,phoneDat.code,pass,n,u);
    phoneDat.busy=false;
    await setup(); /* ayni akis: yerel hesap + bulut */
  }catch(e){phoneDat.busy=false;phoneDat.err=(tr()?'Kod doğrulanamadı: ':'Code failed: ')+e.message;renderAppOrAuth()}
}
function phoneSkip(){goTo('setup','home')}

function applyTheme(){if(!A)return;document.documentElement.dataset.t=DB.beige?'beige':A.theme}""",
    'supabase-core')

# ------------------------------------------------------------------ 2) setup(): buluta kayit + senkron
rep("""  const a=newAcc(u,n,formDat.b,'',e,t);await setPw(a,p);
  DB.accounts[u]=a;DB.last=n;DB.lastUser=u;formDat={u:'',n:'',b:'',e:'',t:'',p:''};
  A0=null;A=a;applyTheme();save();goTo('app','home');greetThen();""",
"""  /* --- bulut: Supabase hesabi (varsa) --- */
  let cloudOK=false,cloudErr='';
  if(cloud()){
    try{
      const j=await sbSignUp(u,p,n,t?'+'+t:'');
      if(j&&j.access_token){sbSave({access_token:j.access_token,refresh_token:j.refresh_token,user:j.user,at:Date.now()});cloudOK=true}
      else if(j&&j.id){/* e-posta onayi acik: oturum yok, yerel devam */}
    }catch(err){
      cloudErr=err.message||'';
      if(/already|exists|registered/i.test(cloudErr)){msg=tr()?'Bu kullanıcı adı bulutta kayıtlı.':'That username is already registered in the cloud.';return renderAppOrAuth()}
    }
  }
  const a=newAcc(u,n,formDat.b,'',e,t);await setPw(a,p);
  DB.accounts[u]=a;DB.last=n;DB.lastUser=u;formDat={u:'',n:'',b:'',e:'',t:'',p:''};
  A0=null;A=a;applyTheme();save();goTo('app','home');greetThen();
  if(cloudOK){sbPush();toast(tr()?'Bulut hesabı oluşturuldu, verilerin eşitleniyor.':'Cloud account created, syncing your data.');}
  else if(cloudErr){toast((tr()?'Bulut hesabı kurulamadı, veriler bu cihazda: ':'Cloud account failed, data stays on this device: ')+cloudErr);}""",
    'setup-cloud')

# ------------------------------------------------------------------ 3) login(): once bulut, sonra yerel
rep("""  const a=key?DB.accounts[key]:null;
  if(a&&await pwMatch(a,loginDat.p)){""",
"""  const a=key?DB.accounts[key]:null;
  /* --- bulut girisi: her cihazda ayni hesap --- */
  if(cloud()&&(!a||!a.pw)){
    try{
      const j=await sbSignIn(u,loginDat.p);
      if(j&&j.access_token){
        const data=await sbPull(u);
        const acc=data||norm({u,nick:(j.user&&j.user.user_metadata&&j.user.user_metadata.nick)||u});
        acc.u=u;await setPw(acc,loginDat.p);
        DB.accounts[u]=acc;DB.last=acc.nick||u;DB.lastUser=u;
        DB.lock[k]={f:0,lv:L.lv,until:0};A=norm(acc);loginDat={u:'',p:''};lastSig=signature(acc);
        applyTheme();save();goTo('app','home');greetThen();
        toast(tr()?'Buluttan yüklendi.':'Loaded from the cloud.');return;
      }
    }catch(err){
      if(err.status===400||err.status===401){/* sifre/hesap bulutta yok: yerel yola dus */}
    }
  }
  if(a&&await pwMatch(a,loginDat.p)){""",
    'login-cloud')

# ------------------------------------------------------------------ 4) kalici oturum: bulut oturumunu da geri yukle
rep("""    A=norm(DB.accounts[user]);lastSig=signature(A);
    loginDat.u=user;
    if(cloud()&&!sbSession())sbRefresh();""",
"""    A=norm(DB.accounts[user]);lastSig=signature(A);
    loginDat.u=user;
    if(cloud()&&!sbSession())sbRefresh();
    if(cloud()&&!sbSession())sbRefresh();""",
    'restore-cloud')

# ------------------------------------------------------------------ 5) senkron: kayitta buluta da yaz (gecikmeli)
rep("""    setItem(LSK,JSON.stringify(DB));
    touchSession();""",
"""    setItem(LSK,JSON.stringify(DB));
    touchSession();
    schedulePush();""",
    'save-push')

rep("const save=()=>{",
"""let pushT=null;
function schedulePush(){try{clearTimeout(pushT)}catch(e){}pushT=setTimeout(()=>{try{sbPush()}catch(e){}},2500)}
const save=()=>{""",
    'schedule-push')

# ------------------------------------------------------------------ 6) gorunum: phone ekrani + bulut anahtari
rep("  else if(view==='setup')h=",
"""  else if(view==='phone'){
    h=`<div class="langbar">${langBtns()}</div>`+box(`<h2>${tr()?'Telefonla doğrula':'Verify by phone'}</h2>${m()}${phoneDat.err?`<div class="note" style="color:#b3261e">${esc(phoneDat.err)}</div>`:''}`+
      (phoneDat.step===1
        ?`<p class="mut">${tr()?'Numaranı yaz, Twilio ile SMS kodu gönderelim.':'Enter your number and we will send an SMS code via Twilio.'}</p><label>${t('phone')}</label><input id="ph" type="tel" inputmode="numeric" placeholder="905551112233" value="${esc(phoneDat.phone)}" oninput="this.value=this.value.replace(/[^0-9]/g,'');phoneDat.phone=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();phoneSend()}"><div class="row"><button onclick="phoneSend()" ${phoneDat.busy?'disabled':''}>${phoneDat.busy?(tr()?'Gönderiliyor…':'Sending…'):(tr()?'Kod gönder':'Send code')}</button><button class="g" onclick="phoneSkip()">${tr()?'Şimdilik geç':'Skip for now'}</button></div>`
        :`<p class="mut">${tr()?'Kodu SMS ile gönderdik: ':'We sent the code by SMS to '}<b>+${esc(phoneDat.phone)}</b></p><label>${t('code')}</label><input id="c" inputmode="numeric" maxlength="6" value="${esc(phoneDat.code)}" oninput="this.value=this.value.replace(/[^0-9]/g,'');phoneDat.code=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();phoneCheck()}"><div class="row"><button onclick="phoneCheck()" ${phoneDat.busy?'disabled':''}>${phoneDat.busy?(tr()?'Kontrol…':'Checking…'):(tr()?'Doğrula ve devam et':'Verify and continue')}</button><button class="g" onclick="phoneDat.step=1;renderAppOrAuth()">${tr()?'Numarayı değiştir':'Change number'}</button></div>`)+
      `<div style="margin-top:1rem"><a class="lg-link" role="button" tabindex="0" onclick="goTo('setup','home')">← ${t('newAccount')}</a></div>`);
  }
  else if(view==='setup')h=""",
    'phone-view')

io.open(p, 'w', encoding='utf-8').write(s)
print('ok')
