'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {suggest,focusPatterns}=require('../day-tools.js');
const facts=require('../daily-facts.js'),news=require('../api/daily-fact.js');
test('the suggestion bag exhausts all twelve tasks before repeating, including its boundary',()=>{
 const batch=Array.from({length:12},()=>suggest(true,()=>.41));
 assert.equal(new Set(batch).size,12);assert.notEqual(batch.at(-1),suggest(true,()=>.41));
 assert.ok(suggest(false).length<=120);
});
test('completed Pomodoros split across Istanbul clock hours, ignoring paused time and incomplete sessions',()=>{
 const t=Date.parse('2026-11-23T11:10+03:00');
 const parts=[{at:t-3600000,seconds:1200},{at:t,seconds:1200}];
 const data=focusPatterns([{at:t,seconds:2400,completed:true,parts},{at:t,seconds:3600,completed:false}],{},t-86400000,t);
 assert.equal(data.sessions,1);assert.equal(data.hours[9],600);assert.equal(data.hours[10],1200);assert.equal(data.hours[11],600);
 assert.equal(data.peak,10);assert.equal(data.hours.reduce((a,b)=>a+b,0),2400);
});
test('weekday load uses recorded completed days and keeps empty or ongoing days out of the sample',()=>{
 const start=Date.parse('2026-11-01T00:00+03:00'),end=Date.parse('2026-11-24T16:00+03:00');
 const days={'2026-11-16':[{t:'a',s:'miss'},{t:'b',done:true}],'2026-11-23':[{t:'c',s:''}],
 '2026-11-17':[{t:'a'},{t:'b'}],'2026-11-24':Array(10).fill({t:'today'}),'2026-11-18':[]};
 assert.deepEqual(focusPatterns([],days,start,end).heavy,{i:1,days:1,tasks:2,unfinished:2});
 assert.equal(focusPatterns([],{},start,end).heavy,null);
});
test('a year of adjacent calendar days always changes topic and both languages have an attributed source',()=>{
 let prev='';const sources=new Set();
 for(let i=0;i<366;i++){const day=new Date(Date.UTC(2028,0,i+1)).toISOString().slice(0,10);
  const {topic,fact}=facts.select(day);assert.notEqual(topic.id,prev);prev=topic.id;sources.add(topic.id);
  assert.ok(fact[0]&&fact[1]&&fact[2]);assert.match(fact[3],/^https:\/\//);
  assert.ok(facts.card(day,true).includes(fact[0]));assert.ok(facts.card(day,false).includes(fact[1]));
 }assert.ok(sources.size>=6);
});
test('the daily news reader selects a recent article from the stated publisher',()=>{
 const now=Date.parse('2026-11-24T10:00Z');
 const story=(link,when,title)=>'<item><title>'+title+'</title><link>'+link+'</link><pubDate>'+when+'</pubDate></item>';
 const feed=story('https://wrong.test/a','2026-11-24','unrelated host')+story('https://www.bbc.com/b','2025-01-01','stale')+story('https://www.bbc.com/c','2026-12-31','future')+story('https://www.bbc.com/d','2026-11-23','Music &amp; dance');
 assert.deepEqual(news.item(feed,['www.bbc.com'],now),{title:'Music & dance',link:'https://www.bbc.com/d',published:'2026-11-23T00:00:00.000Z'});
 assert.equal(news.item(feed,[],now),null);
});
