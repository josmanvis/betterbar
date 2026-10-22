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
  const source=fs.readFileSync('extensions/bkrd/main.tsx','utf8')+'\nexport { normalizeSnapshot, readPreferences, filterBranches, rowKey, ticketLink, openExplorer, ExplorerWindow };';
  const code=transform(source,{transforms:['typescript','jsx','imports'],jsxPragma:'React.createElement'}).code;
  const exports={};
  new Function('exports','require','invoke',code)(exports,id=>{if(id==='react')return hooks;if(id==='@tauri-apps/api/webviewWindow')return{WebviewWindow};throw Error(id);},invoke);
  return{exports,data,render:(fn,props={})=>{cursor=0;return fn(props);},flush:async()=>{for(const run of effects.splice(0))run();await new Promise(setImmediate);},dispose:()=>{for(const slot of slots)slot?.cleanup?.();},windows:()=>({created,shown,existing})};
}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];}
function label(node){return typeof node==='string'?node:!node||typeof node!=='object'?'':React.Children.toArray(node.props?.children).map(label).join('');}
const row=(patch={})=>({repo:'clone-a',repoPath:'/tmp/example-a',branch:'feature/TEST-42',date:'2026-10-20T12:00:00Z',version:'1.2.0',mergedIntoQa:false,mr:null,notes:[],jiraIds:['TEST-42'],unreleased:[],...patch});

test('BKRD normalizes live MR objects, legacy links, missing fields, and unsafe links',()=>{
  const h=harness(),snapshot=h.exports.normalizeSnapshot({branches:[row({mr:{iid:42,url:'https://example.com/mr/42',status:'In review'}}),row({branch:'legacy',mr:'https://example.com/mr/43'}),row({branch:'unsafe',mr:{url:'javascript:alert(1)'},notes:[null,{text:'invalid'}, {id:'n1',text:'<script>private</script>'}],mergedIntoQa:'false'}),null,{}],mrAvailable:false});
  assert.equal(snapshot.branches.length,3);
  assert.equal(snapshot.branches[0].mr.iid,'42');assert.equal(snapshot.branches[1].mr.url,'https://example.com/mr/43');
  assert.equal(snapshot.branches[2].mr,null);assert.equal(snapshot.branches[2].mergedIntoQa,null);assert.equal(snapshot.branches[2].notes.length,1);
  assert.equal(h.exports.ticketLink('https://example.com/','TEST-42'),'https://example.com/browse/TEST-42');
  assert.equal(h.exports.ticketLink('https://example.com/','../bad'),'');assert.equal(h.exports.ticketLink('file:///tmp','TEST-42'),'');
  assert.throws(()=>h.exports.normalizeSnapshot({}));
});

test('BKRD combines search, clone, age, QA and note filters without conflating cloned branches',()=>{
  const h=harness();const rows=h.exports.normalizeSnapshot({branches:[row({notes:[{id:'n1',text:'blocked on captions'}]}),row({repo:'clone-b',repoPath:'/tmp/example-b',mergedIntoQa:true}),row({branch:'old',date:'2025-01-01T00:00:00Z',mergedIntoQa:null})]}).branches;
  const p=h.exports.readPreferences(),now=Date.parse('2026-10-21T00:00:00Z');
  assert.equal(h.exports.filterBranches(rows,'TEST-42 captions',{...p,status:'unmerged',range:7},now).length,1);
  assert.equal(h.exports.filterBranches(rows,'',{...p,status:'unknown'},now)[0].branch,'old');
  assert.equal(h.exports.filterBranches(rows,'',{...p,repo:'clone-b'},now)[0].mergedIntoQa,true);
  assert.equal(h.exports.filterBranches(rows,'',{...p,status:'withNotes'},now).length,1);
  assert.notEqual(h.exports.rowKey(rows[0]),h.exports.rowKey(rows[1]));
  assert.equal(rows.length,3);
});

test('BKRD sorts versions numerically and bounds persisted connection and refresh settings',()=>{
  const h=harness();h.data.set('bb-bkrd-preferences',JSON.stringify({port:-1,interval:1,range:999,status:'unknown',sort:'version',ascending:true}));
  const p=h.exports.readPreferences();assert.equal(p.port,null);assert.equal(p.interval,0);assert.equal(p.range,0);assert.equal(p.status,'unknown');
  const rows=h.exports.normalizeSnapshot({branches:[row({version:'1.10.0'}),row({branch:'another',version:'1.2.0'})]}).branches;
  assert.deepEqual(h.exports.filterBranches(rows,'',{...p,status:'all'}).map(row=>row.version),['1.2.0','1.10.0']);
  h.data.set('bb-bkrd-preferences','null');assert.equal(h.exports.readPreferences().port,null);
});

test('BKRD opens a real extension window and reuses it; hidden labels retain an accessible trigger',async()=>{
  const h=harness();const tree=h.render(h.exports.default,{showLabels:false,slotSize:36,iconSize:28});
  assert.equal(tree.type,'button');assert.equal(tree.props['aria-label'],'Open BKRD Branch Explorer');assert.equal(tree.props.style.width,36);
  assert.ok(!nodes(tree).some(node=>'data-bb-extension-label'in node.props));
  await h.exports.openExplorer();await h.exports.openExplorer();
  assert.equal(h.windows().created,1);assert.equal(h.windows().shown,1);assert.equal(h.windows().existing.options.url,'/?ext=bkrd');
});

test('BKRD retains the previous snapshot on refresh failure and retries without persisting branch data',async()=>{
  let failed=false;const calls=[];
  const h=harness(async(command,args)=>{calls.push([command,args]);if(failed)throw Error('private backend error');return{branches:[row()],repos:[],generatedAt:'2026-10-20T12:00:00Z'};});
  let tree=h.render(h.exports.ExplorerWindow);await h.flush();tree=h.render(h.exports.ExplorerWindow);await h.flush();
  assert.match(label(tree),/feature\/TEST-42/);failed=true;
  await nodes(tree).find(node=>node.type==='button'&&label(node)==='Refresh data').props.onClick();await new Promise(setImmediate);
  tree=h.render(h.exports.ExplorerWindow);assert.match(label(tree),/previous snapshot is still shown/);assert.match(label(tree),/feature\/TEST-42/);
  assert.doesNotMatch(label(tree),/private backend error/);failed=false;
  await nodes(tree).find(node=>node.type==='button'&&label(node)==='Try again').props.onClick();await new Promise(setImmediate);
  tree=h.render(h.exports.ExplorerWindow);assert.doesNotMatch(label(tree),/previous snapshot is still shown/);assert.equal(calls.at(-1)[1].fresh,true);
  assert.equal(h.data.size,0);h.dispose();
});

test('changing the BKRD service port ignores an older in-flight response',async()=>{
  const requests=[];
  const h=harness((command,args)=>new Promise(resolve=>requests.push({args,resolve})));
  h.render(h.exports.ExplorerWindow);await h.flush();
  h.data.set('bb-bkrd-preferences',JSON.stringify({port:4321}));window.dispatchEvent(new Event('bb-bkrd-preferences-changed'));
  h.render(h.exports.ExplorerWindow);await h.flush();assert.equal(requests.length,2);assert.equal(requests[1].args.port,4321);
  requests[1].resolve({branches:[row({branch:'new-service'})]});await new Promise(setImmediate);
  requests[0].resolve({branches:[row({branch:'old-service'})]});await new Promise(setImmediate);
  const tree=h.render(h.exports.ExplorerWindow);assert.match(label(tree),/new-service/);assert.doesNotMatch(label(tree),/old-service/);h.dispose();
});

test('BKRD saves shared branch notes and requires an explicit delete confirmation',async()=>{
  const calls=[],saved={id:'note-1',text:'Handoff note',at:'2026-10-21T12:00:00Z'};
  const h=harness(async(command,args)=>{
    calls.push([command,args]);if(command==='get_bkrd_data')return{branches:[row(),row({repo:'clone-b',repoPath:'/tmp/example-b'})]};
    return{ok:true,notes:args.action==='add_note'?[saved]:[]};
  });
  let tree=h.render(h.exports.ExplorerWindow);await h.flush();tree=h.render(h.exports.ExplorerWindow);await h.flush();
  nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'Handoff note'}});
  tree=h.render(h.exports.ExplorerWindow);nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);
  tree=h.render(h.exports.ExplorerWindow);assert.match(label(tree),/Handoff note/);
  const add=calls.find(([,args])=>args.action==='add_note');assert.equal(add[1].args.branch,'feature/TEST-42');
  const other=nodes(tree).find(node=>node.type==='button'&&node.props['data-index']===1);other.props.onClick();
  tree=h.render(h.exports.ExplorerWindow);await h.flush();tree=h.render(h.exports.ExplorerWindow);assert.match(label(tree),/Handoff note/);
  nodes(tree).find(node=>node.type==='button'&&label(node)==='Delete note').props.onClick();tree=h.render(h.exports.ExplorerWindow);
  assert.match(label(tree),/Delete this note\?/);assert.ok(!calls.some(([,args])=>args.action==='delete_note'));
  nodes(tree).find(node=>node.type==='button'&&label(node)==='Cancel').props.onClick();tree=h.render(h.exports.ExplorerWindow);assert.doesNotMatch(label(tree),/Delete this note\?/);
  nodes(tree).find(node=>node.type==='button'&&label(node)==='Delete note').props.onClick();tree=h.render(h.exports.ExplorerWindow);
  nodes(tree).find(node=>node.type==='button'&&label(node)==='Delete').props.onClick();await new Promise(setImmediate);
  tree=h.render(h.exports.ExplorerWindow);assert.doesNotMatch(label(tree),/Handoff note/);assert.equal(calls.at(-1)[1].args.noteId,'note-1');h.dispose();
});
