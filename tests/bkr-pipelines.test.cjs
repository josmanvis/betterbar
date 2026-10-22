const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react');
const {transform}=require('sucrase');
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
const tick=()=>new Promise(setImmediate);
function harness(invoke=async()=>result()) {
  const data=new Map(),slots=[],effects=[],timers=new Map();let cursor=0;
  global.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  global.window=new EventTarget();
  const hooks={...React,
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},
    useRef:initial=>{const i=cursor++;return slots[i]||(slots[i]={current:initial});},
    useCallback:(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},
  };
  let existing=null,created=0,shown=0;
  class WebviewWindow {
    constructor(label,options){created++;this.label=label;this.options=options;existing=this;}
    static async getByLabel(){return existing;}
    async show(){shown++;}async setFocus(){}
    async once(event,fn){if(event==='tauri://created')queueMicrotask(fn);}
  }
  const source=fs.readFileSync('extensions/bkr-pipelines/main.tsx','utf8')+'\nexport { normalize, readPreferences, Indicator, Monitor };';
  const code=transform(source,{transforms:['typescript','jsx','imports'],jsxPragma:'React.createElement'}).code;
  const exports={};
  new Function('exports','require','invoke','setInterval','clearInterval',code)(exports,id=>{if(id==='react')return hooks;if(id==='@tauri-apps/api/webviewWindow')return{WebviewWindow};throw Error(id);},invoke,(fn,ms)=>{const id={};timers.set(id,{fn,ms});return id;},id=>timers.delete(id));
  return{exports,data,timers,render:(fn=exports.Indicator,props={})=>{cursor=0;return fn(props);},flush:async()=>{for(const run of effects.splice(0))run();await tick();},dispose:()=>{for(const slot of slots)slot?.cleanup?.();},windows:()=>({created,shown,existing})};
}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];}
const button=tree=>nodes(tree).find(node=>node.type==='button');
const base='https://example.com/on24/videoservices/conf_client_opentok_react/-/pipelines';
const failure=(id=12)=>({id,reference:'qa',kind:'branch',updatedAt:'2026-10-21T12:00:00Z',url:`${base}/${id}`});
const result=(failed=[failure()])=>({failed,url:base,checkedAt:'2026-10-21T12:00:00Z'});
const refresh=tree=>button(tree).props.onContextMenu({preventDefault(){},stopPropagation(){}});

test('validates BKR-only links, dates, IDs, and persisted monitoring settings',()=>{
  const h=harness();assert.equal(h.exports.normalize(result()).failed.length,1);
  for(const bad of [{id:-1},{id:1.5},{url:'javascript:alert(1)'},{url:`${base}/99`},{url:base.replace('example.com','evil.example.com')+'/12'},{reference:''},{kind:'unknown'},{updatedAt:'invalid'}])assert.throws(()=>h.exports.normalize(result([{...failure(),...bad}])));
  for(const bad of [{url:'https://example.com/another/project/-/pipelines'},{checkedAt:'invalid'},{failed:null},{failed:[failure(),failure()]}])assert.throws(()=>h.exports.normalize({...result(),...bad}));
  h.data.set('bb-bkr-pipelines-settings',JSON.stringify({seconds:1,days:-1,host:' example.com '}));
  assert.deepEqual(h.exports.readPreferences(),{host:'example.com',seconds:60,days:0});
});

test('failure warning survives hidden labels and clears after a successful replacement',async()=>{
  let failed=true;const h=harness(async()=>result(failed?[failure()]:[]));
  h.render();await h.flush();let tree=h.render(h.exports.Indicator,{showLabels:false,slotSize:32,showBorder:false});
  assert.match(button(tree).props['aria-label'],/1 failing BKR pipelines/);
  assert.equal(button(tree).props.style.width,32);assert.equal(button(tree).props.style.color,'var(--bb-bad)');assert.equal(button(tree).props.style.borderColor,'transparent');
  assert.ok(!nodes(tree).some(node=>'data-bb-extension-label'in node.props));
  failed=false;refresh(tree);await tick();tree=h.render();
  assert.equal(button(tree).props['data-failing'],false);assert.match(button(tree).props.title,/No failing/);assert.equal(h.data.size,0);h.dispose();
});

test('network and authentication errors retain warnings and never appear as a successful check',async()=>{
  let fail=false;const h=harness(async()=>{if(fail)throw Error('private server secret');return result();});
  h.render();await h.flush();fail=true;refresh(h.render());await tick();let tree=h.render();
  assert.equal(button(tree).props['data-failing'],true);assert.match(button(tree).props.title,/previous results shown/);assert.doesNotMatch(button(tree).props.title,/secret/);
  fail=false;refresh(tree);await tick();assert.doesNotMatch(button(h.render()).props.title,/previous results/);h.dispose();
  const offline=harness(async()=>{throw Error('private');});offline.render();await offline.flush();tree=offline.render();
  assert.match(button(tree).props.title,/Could not check/);assert.doesNotMatch(button(tree).props.title,/No failing/);assert.equal(button(tree).props.style.color,'var(--bb-warn)');offline.dispose();
});

test('polls automatically, coalesces overlapping checks, and ignores results for an old filter',async()=>{
  const requests=[];const h=harness((command,args)=>new Promise(resolve=>requests.push({command,args,resolve})));
  h.render();await h.flush();assert.equal(requests[0].command,'get_bkr_pipeline_status');assert.equal(requests[0].args.days,0);
  assert.equal([...h.timers.values()][0].ms,60000);[...h.timers.values()][0].fn();await tick();assert.equal(requests.length,1);
  h.data.set('bb-bkr-pipelines-settings',JSON.stringify({days:1,seconds:30}));window.dispatchEvent(new Event('bb-bkr-pipelines-changed'));
  h.render();await h.flush();assert.equal(requests.length,2);assert.equal(requests[1].args.days,1);assert.equal([...h.timers.values()][0].ms,30000);
  requests[1].resolve(result([]));await tick();requests[0].resolve(result());await tick();assert.match(button(h.render()).props.title,/No failing/);
  h.dispose();assert.equal(h.timers.size,0);
});

test('opens and reuses the native detail window',async()=>{
  const h=harness();h.render();await h.flush();let tree=h.render();button(tree).props.onClick();await tick();
  assert.equal(h.windows().created,1);assert.equal(h.windows().existing.options.url,'/?ext=bkr-pipelines');
  button(tree).props.onClick();await tick();assert.equal(h.windows().created,1);assert.equal(h.windows().shown,1);h.dispose();
});

test('details filter failures and open the selected BKR pipeline',async()=>{
  const calls=[];const h=harness(async(command,args)=>{calls.push([command,args]);return result([failure(),{...failure(13),reference:'v1.0',kind:'tag'}]);});
  h.render(h.exports.Monitor);await h.flush();let tree=h.render(h.exports.Monitor);
  const search=nodes(tree).find(node=>node.type==='input');search.props.onChange({target:{value:'v1.0'}});tree=h.render(h.exports.Monitor);
  const links=nodes(tree).filter(node=>node.type==='button'&&node.props['aria-label']);assert.equal(links.length,1);assert.match(links[0].props['aria-label'],/13/);
  links[0].props.onClick();await tick();assert.equal(calls.at(-1)[0],'bkrd_action');assert.equal(calls.at(-1)[1].args.url,`${base}/13`);h.dispose();
});
