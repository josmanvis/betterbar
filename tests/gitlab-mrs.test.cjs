const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react');
const {transform}=require('sucrase');
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
function harness(invoke=async()=>({branches:[],repos:[]})) {
  const data=new Map(),slots=[],effects=[];let cursor=0;
  global.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  global.window=new EventTarget();global.document=new EventTarget();document.hidden=false;
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
  const source=fs.readFileSync('extensions/gitlab-mrs/main.tsx','utf8')+'\nexport { normalize, readPreferences };';
  const code=transform(source,{transforms:['typescript','jsx','imports'],jsxPragma:'React.createElement'}).code;
  const exports={};
  new Function('exports','require','invoke',code)(exports,id=>{if(id==='react')return hooks;if(id==='@tauri-apps/api/webviewWindow')return{WebviewWindow};throw Error(id);},invoke);
  return{exports,data,render:(fn,props={})=>{cursor=0;return fn(props);},flush:async()=>{for(const run of effects.splice(0))run();await new Promise(setImmediate);},dispose:()=>{for(const slot of slots)slot?.cleanup?.();},windows:()=>({created,shown,existing})};
}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];}
function label(node){return typeof node==='string'?node:!node||typeof node!=='object'?'':React.Children.toArray(node.props?.children).map(label).join('');}
const result=(count=13)=>({count,url:'https://example.com/dashboard/merge_requests?scope=all',checkedAt:'2026-10-21T12:00:00Z'});

test('GitLab validates counts, links, and persisted settings',()=>{
  const h=harness();
  assert.equal(h.exports.normalize(result()).count,13);
  for(const bad of [{count:-1},{count:1.2},{url:'javascript:alert(1)'},{url:'https://user:secret@example.com'},{checkedAt:'invalid'}])assert.throws(()=>h.exports.normalize({...result(),...bad}));
  h.data.set('bb-gitlab-mrs-settings',JSON.stringify({seconds:1,scope:'all',host:' example.com '}));
  assert.deepEqual(h.exports.readPreferences(),{host:'example.com',scope:'authored',seconds:60});
});

test('GitLab keeps zero visible with labels hidden and opens the matching list',async()=>{
  const calls=[];const h=harness(async(command,args)=>{calls.push([command,args]);return result(0);});
  h.render(h.exports.default,{showLabels:false});await h.flush();
  const tree=h.render(h.exports.default,{showLabels:false,slotSize:36});
  assert.match(label(tree),/0/);assert.equal(nodes(tree).find(node=>node.type==='button').props.style.width,36);
  assert.ok(!nodes(tree).some(node=>'data-bb-extension-label'in node.props));
  const button=nodes(tree).find(node=>node.type==='button');assert.match(button.props['aria-label'],/0 open merge requests/);
  await button.props.onClick();await new Promise(setImmediate);
  assert.equal(calls.at(-1)[1].args.url,result().url);assert.equal(h.data.size,0);h.dispose();
});

test('GitLab marks stale counts and retries without persisting data or exposing raw errors',async()=>{
  let fail=false;const h=harness(async()=>{if(fail)throw Error('private server error');return result(123);});
  h.render(h.exports.default);await h.flush();let tree=h.render(h.exports.default);
  assert.match(label(tree),/99\+/);fail=true;
  nodes(tree).find(node=>node.type==='button').props.onContextMenu({preventDefault(){},stopPropagation(){}});await new Promise(setImmediate);
  tree=h.render(h.exports.default);let button=nodes(tree).find(node=>node.type==='button');
  assert.match(button.props.title,/123 open merge requests/);assert.match(button.props.title,/previous count shown/);assert.doesNotMatch(button.props.title,/private/);
  fail=false;button.props.onContextMenu({preventDefault(){},stopPropagation(){}});await new Promise(setImmediate);
  tree=h.render(h.exports.default);assert.doesNotMatch(nodes(tree).find(node=>node.type==='button').props.title,/previous count shown/);
  assert.equal(h.data.size,0);h.dispose();
});

test('GitLab ignores in-flight results from a previous scope',async()=>{
  const requests=[];const h=harness((command,args)=>new Promise(resolve=>requests.push({args,resolve})));
  h.render(h.exports.default);await h.flush();
  h.data.set('bb-gitlab-mrs-settings',JSON.stringify({scope:'review'}));window.dispatchEvent(new Event('bb-gitlab-mrs-changed'));
  h.render(h.exports.default);await h.flush();assert.equal(requests.length,2);assert.equal(requests[1].args.scope,'review');
  requests[1].resolve(result(7));await new Promise(setImmediate);requests[0].resolve(result(13));await new Promise(setImmediate);
  const button=nodes(h.render(h.exports.default)).find(node=>node.type==='button');assert.match(button.props.title,/7 open merge requests/);assert.match(button.props.title,/Review requested/);h.dispose();
});
