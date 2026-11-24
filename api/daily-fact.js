'use strict';
const {select}=require('../daily-facts.js');
const feeds={space:['bilim-teknoloji','bilim_teknoloji','news/science_and_environment'],culture:['kultur','kultur_sanat','news/entertainment_and_arts'],earth:['yasam','cevre','news/science_and_environment'],tech:['bilim-teknoloji','bilim_teknoloji','news/technology'],art:['kultur','kultur_sanat','news/entertainment_and_arts'],sport:['spor','spor','sport']};
function xmlText(value){
 return String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&(amp|lt|gt|quot|apos|#39|#\d+|#x[\da-f]+);/gi,(match,k)=>{
   const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
   if(named[k])return named[k];
   const n=k.startsWith('#x')?Number.parseInt(k.slice(2),16):Number(k.slice(1));
   return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
 }).trim();
}
function item(xml,allowed,now){
 for(const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
   const get=tag=>xmlText(match[1].match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+tag+'>','i'))?.[1]);
   const title=get('title'),date=Date.parse(get('pubDate'));let url;try{url=new URL(get('link'))}catch{continue}
   if(!title||url.protocol!=='https:'||!allowed.includes(url.hostname)||!Number.isFinite(date)||date>now||now-date>10*86400000)continue;
   return {title:title.slice(0,240),link:url.href,published:new Date(date).toISOString()};
 }return null;
}
async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end()}
 const lang=req.query.lang==='tr'?'tr':'en',now=Date.now(),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(now);
 const [aa,trt,bbc]=feeds[select(day).topic.id];
 const choices=lang==='tr'?[['Anadolu Ajansı','https://www.aa.com.tr/tr/rss/default?cat='+aa,['www.aa.com.tr']],['TRT Haber','https://www.trthaber.com/'+trt+'_articles.rss',['www.trthaber.com']]]:[['BBC','https://feeds.bbci.co.uk/'+bbc+'/rss.xml',['www.bbc.com','www.bbc.co.uk']]];
 for(const [source,feed,hosts] of choices){
   try{
     const response=await fetch(feed,{signal:AbortSignal.timeout(3000),headers:{'User-Agent':'ImprovinYourDay/1.0 (https://badgalnurkan.com)'}});if(!response.ok)continue;
     const reader=response.body.getReader(),decoder=new TextDecoder();let xml='',size=0;
     while(size<768000){const {done,value}=await reader.read();if(done)break;size+=value.length;xml+=decoder.decode(value,{stream:true});if(xml.includes('</item>')&&item(xml,hosts,now))break}
     await reader.cancel();const found=item(xml,hosts,now);
     if(found){res.setHeader('Cache-Control','public, max-age=300, s-maxage=1800');return res.status(200).json({day,source,...found})}
   }catch{}
 }
 res.setHeader('Cache-Control','public, max-age=60, s-maxage=120');return res.status(200).json({day});
}
module.exports=handler;
module.exports.item=item;
