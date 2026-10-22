const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react');
const {transform}=require('sucrase');
const tick=()=>new Promise(setImmediate);
function harness({register=async()=>true,delayedListener=false}={}) {
  const slots=[],effects=[],calls=[],timers=new Map();let cursor=0,listener,attach,unlistened=0,visible=false,hides=0;
  const data=new Map();global.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const hooks={...React,
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>slots[i].value=v];},
    useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
  };
  const drawer={isVisible:async()=>visible,hide:async()=>{visible=false;hides++;}};
  const current={listen:async(event,callback)=>{assert.equal(event,'apps-drawer-toggle');if(delayedListener)await new Promise(resolve=>attach=resolve);listener=callback;return()=>{unlistened++;listener=undefined;};}};
  const code=transform(fs.readFileSync('extensions/apps-drawer/main.tsx','utf8')+'\nexport {useDrawerShortcut};',{transforms:['typescript','jsx','imports'],jsxPragma:'React.createElement'}).code;
  const modules={react:hooks,'@tauri-apps/api/webviewWindow':{WebviewWindow:{getCurrent:()=>current,getByLabel:async()=>drawer}},'@tauri-apps/api/dpi':{},'@tauri-apps/api/window':{}};
  const exports={};new Function('exports','require','invoke','setInterval','clearInterval',code)(exports,id=>modules[id],async(command,args)=>{calls.push([command,args]);return register(args);},(fn,ms)=>{const id={};timers.set(id,{fn,ms});return id;},id=>timers.delete(id));
  const errors=[];const error=value=>errors.push(value);
  return{calls,timers,errors,render:(enabled=true)=>{cursor=0;return exports.useDrawerShortcut(enabled,error);},flush:async()=>{for(const effect of effects.splice(0))effect();await tick();},dispose:()=>{for(const slot of slots)slot?.cleanup?.();},attach:()=>attach?.(),fire:()=>listener?.(),setVisible:v=>visible=v,hides:()=>hides,unlistened:()=>unlistened};
}
test('registers by default, toggles visible drawer, and unregisters on disable',async()=>{
  const h=harness();h.render();await h.flush();assert.equal(h.render(),'ready');
  assert.deepEqual(h.calls[0],['set_apps_drawer_shortcut',{enabled:true}]);
  assert.equal([...h.timers.values()][0].ms,5000);h.setVisible(true);h.fire();await tick();assert.equal(h.hides(),1);assert.equal(h.errors.length,0);
  h.render(false);await h.flush();assert.equal(h.render(false),'idle');assert.equal(h.calls.at(-1)[1].enabled,false);assert.equal(h.unlistened(),1);assert.equal(h.timers.size,0);
});
test('shows missing Accessibility permission and picks up a grant without restart',async()=>{
  let trusted=false;const h=harness({register:async()=>trusted});h.render();await h.flush();assert.equal(h.render(),'permission');
  trusted=true;[...h.timers.values()][0].fn();await tick();assert.equal(h.render(),'ready');
  trusted=false;[...h.timers.values()][0].fn();await tick();assert.equal(h.render(),'permission');h.dispose();
});
test('late listener registration cannot enable the shortcut after unmount',async()=>{
  const h=harness({delayedListener:true});h.render();await h.flush();h.dispose();h.attach();await tick();
  assert.equal(h.unlistened(),1);assert.ok(h.calls.every(([,args])=>!args.enabled));assert.equal(h.timers.size,0);
});
test('registration failures are reported and recover on a later permission check',async()=>{
  let fail=true;const h=harness({register:async()=>{if(fail)throw Error('native');return true;}});h.render();await h.flush();assert.equal(h.render(),'error');
  fail=false;[...h.timers.values()][0].fn();await tick();assert.equal(h.render(),'ready');h.dispose();
});
