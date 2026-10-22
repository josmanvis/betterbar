const ROOT = require("node:path").resolve(__dirname, "..");
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(ROOT+"/package.json");
const React = req('react');
const { transform } = req('sucrase');
const data = new Map();
global.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
let monitors = [{ name: 'Built-in', position: {x:0,y:0}, size:{width:3024,height:1964}, workArea:{position:{x:0,y:60},size:{width:3024,height:1904}}, scaleFactor:2 }];
let visible = true, pos = {x:200,y:240}, dimensions = {width:1600,height:1240};
const drawer = { isVisible:async()=>visible, outerPosition:async()=>pos, innerSize:async()=>dimensions, scaleFactor:async()=>monitors[0].scaleFactor,
  setSize:async size=>{ dimensions={width:size.width*monitors[0].scaleFactor,height:size.height*monitors[0].scaleFactor}; },
  outerSize:async()=>dimensions, setPosition:async p=>{pos={x:p.x,y:p.y};}, show:async()=>{visible=true;}, hide:async()=>{visible=false;}, setFocus:async()=>{} };
const main = {innerPosition:async()=>({x:1000,y:1840}), innerSize:async()=>({width:600,height:100}), scaleFactor:async()=>2};
const api = {getCurrent:()=>drawer,getByLabel:async label=>label==='main'?main:drawer};
class Point { constructor(x,y){this.x=x;this.y=y;} }
class Size { constructor(width,height){this.width=width;this.height=height;} }
function evaluate(file, extra='', extraModules={}, react=React, invoke=async()=>{}) {
  const source=fs.readFileSync(ROOT+"/"+file,'utf8')+'\n'+extra;
  const code=transform(source,{transforms:['typescript','jsx','imports'],jsxPragma:'React.createElement',jsxFragmentPragma:'React.Fragment'}).code;
  const modules={react, '@tauri-apps/api/webviewWindow':{WebviewWindow:api}, '@tauri-apps/api/dpi':{LogicalSize:Size,PhysicalPosition:Point}, '@tauri-apps/api/window':{availableMonitors:async()=>monitors,currentMonitor:async()=>monitors[0]}, ...extraModules};
  const exports={}; new Function('exports','module','require','React','invoke',code)(exports,{exports},id=>{assert.ok(id in modules,id);return modules[id];},react,invoke); return exports;
}
(async()=>{
 const ext=evaluate('extensions/apps-drawer/main.tsx','export {readPreferences,readGeometry,persistGeometry,resetGeometry,openDrawer,toggleDrawer};', {'@betterbar/api':{}});
 assert.equal(ext.readPreferences().rememberWindow,true);
 assert.equal(ext.readPreferences().doubleTapCommand,true);
 data.set('bb-apps-drawer-settings',JSON.stringify({doubleTapCommand:false}));assert.equal(ext.readPreferences().doubleTapCommand,false);
 data.set('bb-apps-drawer-settings',JSON.stringify({iconSize:999,columns:99,accentColor:'bad',recentLimit:100}));
 assert.equal(ext.readPreferences().iconSize,0);assert.equal(ext.readPreferences().columns,0);assert.equal(ext.readPreferences().recentLimit,4);
 data.set('bb-apps-drawer-active-layout',JSON.stringify({layout:'library',reset:null}));
 await ext.persistGeometry();assert.equal(ext.readGeometry('library').width,800);assert.equal(ext.readGeometry('library').height,620);
 pos={x:300,y:400};await ext.persistGeometry(); assert.equal(ext.readGeometry('library').x,300);
 await ext.openDrawer();assert.deepEqual(pos,{x:300,y:400});assert.deepEqual(dimensions,{width:1600,height:1240});
 data.set('bb-apps-drawer-settings',JSON.stringify({layout:'panel'}));
 await ext.openDrawer();assert.deepEqual(dimensions,{width:1120,height:1300});
 pos={x:500,y:600};await ext.persistGeometry();assert.equal(ext.readGeometry('panel').x,500);assert.equal(ext.readGeometry('library').x,300);
 data.set('bb-apps-drawer-settings','{}');await ext.openDrawer();assert.deepEqual(pos,{x:300,y:400});
 visible=false;pos={x:999,y:999};await ext.persistGeometry();assert.equal(ext.readGeometry('library').x,300);visible=true;
 data.set('bb-apps-drawer-opening',String(Date.now()));await ext.persistGeometry();assert.equal(ext.readGeometry('library').x,300);data.delete('bb-apps-drawer-opening');
 data.set('bb-apps-drawer-settings',JSON.stringify({rememberWindow:false}));await ext.persistGeometry();assert.equal(ext.readGeometry('library').x,300);
 data.set('bb-apps-drawer-settings','{}');
 monitors=[{name:'Built-in',position:{x:100,y:0},size:{width:1512,height:982},workArea:{position:{x:100,y:30},size:{width:1512,height:952}},scaleFactor:1}];
 await ext.openDrawer();assert.deepEqual(pos,{x:250,y:200});assert.deepEqual(dimensions,{width:800,height:620});
 monitors=[{name:'Other',position:{x:0,y:0},size:{width:900,height:700},workArea:{position:{x:0,y:30},size:{width:900,height:670}},scaleFactor:1}];
 await ext.openDrawer();assert.ok(pos.x>=12&&pos.x+dimensions.width<=888);assert.ok(pos.y>=42&&pos.y+dimensions.height<=688);
 ext.resetGeometry('library');assert.equal(ext.readGeometry('library'),null);await ext.persistGeometry();assert.equal(ext.readGeometry('library'),null);assert.ok(ext.readGeometry('panel'));
 data.set('bb-apps-drawer-geometry',JSON.stringify({library:{x:NaN,width:800}}));assert.equal(ext.readGeometry('library'),null);
 visible=false;await ext.toggleDrawer();assert.equal(visible,true);
 pos={x:60,y:80};const before={...dimensions};await ext.toggleDrawer();assert.equal(visible,false);
 await ext.toggleDrawer();assert.equal(visible,true);assert.deepEqual(pos,{x:60,y:80});assert.deepEqual(dimensions,before);
 const calls=[]; const hooks={...React,useState:initial=>[initial,()=>{}],useRef:value=>({current:value})};
 for(const [file,expected] of [['timesheets','open_timesheets'],['floatnote','open_floatnote']]) {
   const app=evaluate('extensions/'+file+'/main.tsx','',{'@tauri-apps/api/path':{homeDir:async()=>'/Users/test',join:async(...parts)=>parts.join('/')}},hooks,async(...args)=>{calls.push(args);});
   const tree=app.default({iconSize:48,slotSize:56});const button=tree.props.children[1];assert.equal(button.props.style.width,56);assert.equal(button.props.children.props.width,48);
   await button.props.onClick();assert.equal(calls.at(-1)[0],expected);
 }

 console.log('PASS: geometry save/restore, per-layout persistence, hidden/restore/reset guards, display scale and bounds, preference validation, both launcher commands and icon sizing.');
})().catch(error=>{console.error(error);process.exitCode=1;});
