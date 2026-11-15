from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
DIST.mkdir(exist_ok=True)
for name in ('index.html', 'privacy.html', 'kvkk.html', 'terms.html'):
    shutil.copy2(ROOT / name, DIST / name)

# This isolated sample has no cloud requests or persistent browser storage.
# It is never used as the application's real entrypoint.
html = (ROOT / 'index.html').read_text()
boot = "view='welcome';pg='home';A=null;\napplyTheme();renderAppOrAuth();\nbootstrapCloudAuth();"
fixture = """
const previewParams=new URLSearchParams(location.search);
DB={accounts:{},last:'',lastUser:'',lock:{},lang:previewParams.get('lang')==='en'?'en':'tr',beige:false};
document.documentElement.lang=DB.lang;
A=newAcc('ornek_kullanici',DB.lang==='tr'?'Örnek Kullanıcı':'Sample User','','','sample@example.invalid','');
A.theme=previewParams.get('theme')==='black'?'black':'white';DB.themeChoice=A.theme;
if(previewParams.get('page')==='welcome-google'){A.loginMethod='google';A.authUid='preview-only';}
A.pctFrom=addD(today(),-50);A.reportStart=A.pctFrom;
A.tasks=DB.lang==='tr'?[{t:'Bugünün önceliklerini belirle',s:'done'},{t:'Kendine odaklanmak için zaman ayır',s:''}]:[{t:'Set today’s priorities',s:'done'},{t:'Make time to focus on yourself',s:''}];
A.projects=[{n:DB.lang==='tr'?'Küçük bir adım, her gün':'A small step, every day',d:addD(today(),5)}];
if(previewParams.get('page')==='empty-progress'){A.tasks=[];A.projects=[];}else A.activeDays[today()]=true;
DB.accounts[A.u]=A;DB.last=A.nick;DB.lastUser=A.u;
view=['welcome','welcome-google'].includes(previewParams.get('page'))?'welcome':'app';if(view==='welcome')A=null;pg=NAV.some(([k])=>k===previewParams.get('page'))?previewParams.get('page'):'home';
if(previewParams.get('page')==='empty-progress')pg='pc';
applyTheme();renderAppOrAuth();
document.fonts.ready.then(()=>requestAnimationFrame(()=>{centerNav(true);document.body.dataset.previewReady=previewParams.get('rev')||'0'}));
window.addEventListener('message',event=>{if(event.source===parent&&event.data==='preview-entry'){playWelcomeTransition()}});
window.addEventListener('message',event=>{if(event.source===parent&&event.data==='preview-login'&&!A){A=DB.accounts[DB.lastUser];view='app';pg='home';applyTheme();renderAppOrAuth()}});
"""
assert html.count(boot) == 1, 'Application boot marker changed'
html = html.replace(boot, fixture)
# Date simulation belongs only to this isolated review, never to index.html.
html = html.replace('const today=()=>D(new Date()),fmt=', "const today=()=>{const value=new URLSearchParams(location.search).get('date');return validProgressDate(value)?value:D(new Date())},fmt=", 1)
html = html.replace('function istanbulDayKey(at=new Date()){', "function istanbulDayKey(at=new Date()){const chosen=new URLSearchParams(location.search).get('date');if(validProgressDate(chosen))return chosen;", 1)
html = html.replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'">', 1)
html = html.replace('</style>', '\n/* Phone-like overlay scrollbars in the review frame. */\nhtml{scrollbar-width:none}html::-webkit-scrollbar{display:none}\n</style>', 1)
(DIST / 'review-app.html').write_text(html)
shutil.copy2(ROOT / 'tests' / 'review.html', DIST / 'review.html')
print('Static app and isolated responsive review built.')
