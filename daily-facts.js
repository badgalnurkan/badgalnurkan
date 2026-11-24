'use strict';
const IYFacts=(()=>{
 const topics=[
  {id:'space',names:['Uzay','Space'],facts:[
    ['Ay, ekseninde bir turu Dünya çevresindeki bir turla aynı sürede tamamlar. Bu yüzden Dünya’dan genellikle aynı yüzünü görürüz.','The Moon turns once on its axis during each orbit around Earth, so we usually see the same face.','NASA','https://science.nasa.gov/moon/tidal-locking/'],
    ['Venüs kendi ekseninde yaklaşık 243 Dünya gününde döner. Güneş çevresindeki turu ise yaklaşık 225 Dünya günü sürer.','Venus takes about 243 Earth days to rotate and about 225 Earth days to orbit the Sun.','NASA','https://science.nasa.gov/venus/facts/']]},
  {id:'culture',names:['Kültür','Culture'],facts:[
    ['UNESCO, bir topluluğun kuşaktan kuşağa aktardığı dansları da somut olmayan kültürel miras kapsamında değerlendirir.','UNESCO includes dances passed between generations among the performing arts of intangible cultural heritage.','UNESCO','https://ich.unesco.org/en/performing-arts-00054'],
    ['Bir gösteri geleneğinde kullanılan çalgılar, kostümler ve sahne mekânları da o geleneğin kültürel mirasının parçası olabilir.','In a performing tradition, instruments, costumes and the spaces used to perform can form part of its cultural heritage.','UNESCO','https://ich.unesco.org/en/performing-arts-00054']]},
  {id:'earth',names:['Yeryüzü','Earth'],facts:[
    ['Okyanuslar, Dünya’daki suyun yaklaşık yüzde 96,5’ini barındırır.','Earth’s oceans hold about 96.5 percent of its water.','USGS','https://www.usgs.gov/water-science-school/science/oceans-and-seas-and-water-cycle'],
    ['Dünya yüzeyinin yaklaşık yüzde 71’i suyla kaplıdır.','Water covers about 71 percent of Earth’s surface.','USGS','https://www.usgs.gov/water-science-school/science/how-much-water-there-earth']]},
  {id:'tech',names:['Teknoloji','Technology'],facts:[
    ['Tim Berners-Lee, World Wide Web’i 1989’da CERN’de bilim insanlarının bilgi paylaşımını kolaylaştırmak için önerdi.','Tim Berners-Lee proposed the World Wide Web at CERN in 1989 to help scientists share information.','CERN','https://home.cern/science/computing/birth-web'],
    ['İlk web sitesi CERN’de kurulmuştu. Sayfaları, web’in ne olduğunu ve kendi web sunucunu nasıl kurabileceğini anlatıyordu.','The first website at CERN explained the Web itself, including how to set up a web server.','CERN','https://home.cern/science/computing/birth-web']]},
  {id:'art',names:['Sanat','Art'],facts:[
    ['Metropolitan Sanat Müzesi, kamu malı eserlerinin açık erişim kapsamındaki görsellerini CC0 ile paylaşıyor.','The Metropolitan Museum of Art shares open-access images of public-domain works under CC0.','The Met','https://www.metmuseum.org/hubs/open-access'],
    ['The Met’in koleksiyonundaki açık erişimli eser görsellerini kendi tasarımında kullanabilir ve yeniden düzenleyebilirsin.','The Met’s open-access collection images can be remixed and used in new designs.','The Met','https://www.metmuseum.org/hubs/open-access']]},
  {id:'sport',names:['Spor','Sport'],facts:[
    ['Standart maraton mesafesi tam 42 kilometre 195 metredir.','A standard marathon measures exactly 42 kilometres and 195 metres.','World Athletics','https://worldathletics.org/disciplines/road-running/marathon'],
    ['1908 Londra Olimpiyatları’nda koşulan 42,195 kilometrelik mesafe, 1921’de maratonun standart uzunluğu oldu.','The London 1908 marathon distance became the standard 42.195 kilometres in 1921.','World Athletics','https://worldathletics.org/disciplines/road-running/marathon']]}
 ];
 function select(day){
   const n=Math.floor(Date.parse(day+'T00:00:00Z')/86400000);
   const index=((n%topics.length)+topics.length)%topics.length,topic=topics[index];
   return {topic,fact:topic.facts[Math.abs(Math.floor(n/topics.length))%topic.facts.length]};
 }
 const requests=new Map();
 function card(day,turkish){
   const {topic,fact}=select(day),index=turkish?0:1;
   return `<section class="card" id="daily-fact" data-day="${day}"><div class="mut">${turkish?'Günün bilgisi':'Daily discovery'} · ${topic.names[index]}</div><p>${fact[index]}</p><a href="${fact[3]}" target="_blank" rel="noopener noreferrer">${fact[2]}</a><p class="mut" data-fact-news hidden></p></section>`;
 }
 function refresh(day,turkish){
   const slot=document.querySelector('#daily-fact[data-day="'+day+'"] [data-fact-news]');if(!slot)return;
   const lang=turkish?'tr':'en',key=day+lang;
   if(!requests.has(key)){
     if(requests.size>4)requests.clear();
     requests.set(key,fetch('/api/daily-fact?lang='+lang+'&day='+day,{signal:AbortSignal.timeout(9000)}).then(r=>r.ok?r.json():null).catch(()=>null));
   }
   requests.get(key).then(data=>{
     if(!slot.isConnected||data?.day!==day||!data.title||!data.link)return;
     let url;try{url=new URL(data.link)}catch{return}
     if(url.protocol!=='https:'||!['www.aa.com.tr','www.trthaber.com','www.bbc.com','www.bbc.co.uk','www.nasa.gov'].includes(url.hostname))return;
     const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=data.title;
     const date=new Date(data.published);if(!Number.isFinite(date.getTime()))return;
     slot.replaceChildren(document.createTextNode((turkish?'Konuyla ilgili son haber':'Recent reporting')+' · '+data.source+' · '+date.toLocaleDateString(lang,{timeZone:'Europe/Istanbul'})+' — '),link);slot.hidden=false;
   });
 }
 return {select,card,refresh};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=IYFacts;
