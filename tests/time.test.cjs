const ROOT = require("node:path").resolve(__dirname, "..");
const fs=require('node:fs'),assert=require('node:assert/strict');
const req=require('node:module').createRequire(ROOT+"/package.json");
const React=req('react'),{transform}=req('sucrase');
const data=new Map();global.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
global.window=new EventTarget();global.StorageEvent=class extends Event {constructor(type,options={}){super(type);Object.assign(this,options)}};
global.document=new EventTarget();
let states=[],cursor=0,effects=[];
const hooks={...React,useState:initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}];},useMemo:fn=>fn(),useEffect:fn=>{effects.push(fn);}};
let source=fs.readFileSync(ROOT+"/extensions/time/main.tsx",'utf8')+'\nexport {readPreferences,validTimezone,clocksFor,formatTime,timeFormatter,useNow};';
const code=transform(source,{transforms:['typescript','jsx','imports'],jsxPragma:'React.createElement',jsxFragmentPragma:'React.Fragment'}).code;
const ext={};new Function('exports','require','React',code)(ext,()=>hooks,hooks);
let prefs=ext.readPreferences();const now=new Date('2026-10-20T00:05:09Z');
assert.equal(ext.formatTime(ext.timeFormatter('UTC',prefs),now,prefs),'12:05 AM');
prefs={...prefs,hour12:false,showSeconds:true};assert.equal(ext.formatTime(ext.timeFormatter('UTC',prefs),now,prefs),'00:05:09');
prefs={...prefs,hour12:true,showPeriod:false};assert.equal(ext.formatTime(ext.timeFormatter('UTC',prefs),now,prefs),'12:05:09');
assert.equal(ext.validTimezone('Invalid/City'),false);assert.equal(ext.validTimezone('America/New_York'),true);
assert.equal(ext.formatTime(null,now,prefs),'--:--');assert.deepEqual(ext.clocksFor({clocks:[]}),[]);assert.equal(ext.clocksFor().length,6);
data.set('bb-time-settings',JSON.stringify({timeSize:900,labelSize:-1,spacing:NaN,date:'invalid',weight:900}));
prefs=ext.readPreferences();assert.equal(prefs.timeSize,24);assert.equal(prefs.labelSize,8);assert.equal(prefs.spacing,16);assert.equal(prefs.date,'none');assert.equal(prefs.weight,400);data.clear();
let config={clocks:[{id:'a',code:'NY',tz:'America/New_York'},{id:'b',code:'UTC',tz:'UTC'}]},updates=0;
function render(){cursor=0;effects=[];return ext.Settings({config,updateConfig:patch=>{config={...config,...patch};updates++;}});}
function nodes(node){if(!node||typeof node!=='object')return [];if(typeof node.type==='function'){return node.type.name==='Choice'?nodes(node.type(node.props)):[];}return [node,...React.Children.toArray(node.props?.children).flatMap(nodes)];}
function button(tree, text){return nodes(tree).find(n=>n.type==='button'&&n.props.children===text);}
let tree=render();nodes(tree).find(n=>n.props['aria-label']==='Move UTC up').props.onClick();assert.equal(config.clocks[0].id,'b');
tree=render();button(tree,'Add timezone').props.onClick();tree=render();
let fields=nodes(tree).filter(n=>n.type==='input'&&!n.props.type);fields[0].props.onChange({target:{value:'Tokyo'}});fields[1].props.onChange({target:{value:'Bad/Zone'}});tree=render();
let before=updates;nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(updates,before);tree=render();assert.ok(nodes(tree).some(n=>n.props.role==='alert'));
fields=nodes(tree).filter(n=>n.type==='input'&&!n.props.type);fields[1].props.onChange({target:{value:'Asia/Tokyo'}});tree=render();nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(config.clocks.at(-1).code,'Tokyo');assert.equal(config.clocks.at(-1).tz,'Asia/Tokyo');
tree=render();nodes(tree).find(n=>n.props['aria-label']==='Edit Tokyo').props.onClick();tree=render();fields=nodes(tree).filter(n=>n.type==='input'&&!n.props.type);fields[0].props.onChange({target:{value:'Japan'}});tree=render();const id=config.clocks.at(-1).id;nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(config.clocks.at(-1).id,id);assert.equal(config.clocks.at(-1).code,'Japan');
tree=render();const format=nodes(tree).find(n=>n.type==='select'&&n.props.value==='12');format.props.onChange({target:{value:'24'}});assert.equal(JSON.parse(data.get('bb-time-settings')).hour12,false);
for(const clock of [...config.clocks]){tree=render();nodes(tree).find(n=>n.props['aria-label']==='Remove '+clock.code).props.onClick();}assert.equal(config.clocks.length,0);
const oldSet=global.setTimeout,oldClear=global.clearTimeout,oldNow=Date.now;let timers=new Map(),counter=0;
try{
 global.setTimeout=(fn,delay)=>{timers.set(++counter,{fn,delay});return counter;};global.clearTimeout=id=>timers.delete(id);Date.now=()=>1500;
 for(const seconds of [true,false]){
  states=[];cursor=0;effects=[];ext.useNow(seconds);const cleanup=effects[0]();assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,seconds?500:58500);
  document.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,1);cleanup();assert.equal(timers.size,0);document.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);
 }
}finally{global.setTimeout=oldSet;global.clearTimeout=oldClear;Date.now=oldNow;}
console.log('PASS: clock add/edit/remove/reorder, timezone validation, 12/24-hour midnight and seconds, hidden AM/PM, empty clocks, preferences, timer alignment and cleanup.');
