// Isolated CI provider double. No Cloudflare challenge or production Auth calls.
module.exports=async browser=>{
 const install=async target=>target.addInitScript(()=>{
  let next=0;const widgets=new Map();
  window.turnstile={render(container,options){const id=String(++next);widgets.set(id,options);const badge=document.createElement('div');badge.textContent='CI security provider';badge.style.cssText='max-width:100%;width:150px;height:65px';container.appendChild(badge);queueMicrotask(()=>options.callback('ci-proof-'+id));return id},reset(id){const options=widgets.get(id);if(options)queueMicrotask(()=>options.callback('ci-fresh-proof-'+id))},remove(id){widgets.delete(id)}};
 });
 const newPage=browser.newPage.bind(browser),newContext=browser.newContext.bind(browser);
 browser.newPage=async(...args)=>{const page=await newPage(...args);await install(page);return page};
 browser.newContext=async(...args)=>{const context=await newContext(...args);await install(context);return context};
};
