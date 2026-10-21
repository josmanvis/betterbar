const ROOT = require("node:path").resolve(__dirname, "..");
const fs=require('node:fs'),assert=require('node:assert/strict');
const req=require('node:module').createRequire(ROOT+"/package.json");const React=req('react'),{renderToStaticMarkup}=req('react-dom/server'),{transform}=req('sucrase');
function evaluate(file,modules={}){const code=transform(fs.readFileSync(ROOT+"/"+file,'utf8'),{transforms:['typescript','jsx','imports'],jsxPragma:'React.createElement',jsxFragmentPragma:'React.Fragment'}).code;const exports={};new Function('exports','require','React',code)(exports,id=>{assert.ok(id in modules,id);return modules[id];},React);return exports;}
const types=evaluate('src/types.ts'),policy=evaluate('src/extension-replacements.ts'),appearance=evaluate('src/appearance.ts');
const layout=evaluate('src/bar-layout.ts',{'./types':types,'./extension-replacements':policy});
const config={...types.DEFAULT_CONFIG,sets:[{id:'empty',name:'Empty',items:[]}],activeSetId:'empty',enabledExtensions:['apps-drawer'],showClocks:true,showMusic:false,showBattery:true};
let migrated=policy.migrateExtensionReplacements(config,['time','power','media']);assert.deepEqual(migrated.enabledExtensions,['apps-drawer','time','power']);assert.equal(migrated.clocks,config.clocks);assert.equal(migrated.sectionOrder,config.sectionOrder);assert.deepEqual(migrated.extensionReplacements,['time','media','power']);assert.equal(policy.migrateExtensionReplacements(migrated,['time','power','media']),migrated);
migrated={...migrated,enabledExtensions:['apps-drawer']};assert.equal(policy.migrateExtensionReplacements(migrated,['time','power','media']),migrated);assert.equal(policy.replacementForSection('time',['time']).name,'time');assert.equal(policy.replacementForSection('time',[]),undefined);
const tag=text=>()=>React.createElement('span',null,text);let installed=[],enabled=[];const polling=[];
const modules={react:React,'framer-motion':{motion:{div:'div'},AnimatePresence:({children})=>children},'@dnd-kit/core':{DndContext:({children})=>children,useSensors:()=>[],useSensor:()=>null},'@dnd-kit/sortable':{SortableContext:({children})=>children},'@tauri-apps/api/window':{},'@tauri-apps/api/menu':{},'@phosphor-icons/react':{GearSix:()=>null},'../types':types,'../appearance':appearance,'../extension-replacements':policy,'../bar-layout':layout,'./SortableBarItem':{SortableBarItem:({id,children})=>React.createElement('div',{'data-bb-item':id},children)},'../iconChrome':{hasChrome:()=>false},'../tauri-bridge':{},'../extensions-runtime':{useExtensionRegistry:()=>({ready:true,extensions:installed.map(name=>({name,displayName:name}))}),useExtensions:()=>enabled.map(name=>({name,Component:tag('EXT_'+name)}))},'./deviceIcons':{DEVICE_GLYPHS:{}},'../hooks/useBattery':{useBattery:on=>{polling.push(['battery',on]);return {available:true,percentage:50};}},'../hooks/useMusic':{useMusic:on=>{polling.push(['music',on]);return {available:true};}},'../hooks/useRunningApps':{useRunningApps:()=>[]},'../hooks/useRunningWindows':{useRunningWindows:()=>[]},'../hooks/useWindowPosition':{useWindowPosition:()=>{}},'../hooks/useAppIcons':{useAppIcons:()=>({})},'./SpacesIndicator':{useSpaces:()=>[]}};
for(const [file,name,marker] of [['DockIcon','DockIcon','PINNED'],['TerminalInput','TerminalInput','TERMINAL'],['WorldClock','WorldClock','NATIVE_TIME'],['BatteryIndicator','BatteryIndicator','NATIVE_POWER'],['MusicIndicator','MusicIndicator','NATIVE_MEDIA'],['CaffeineIndicator','CaffeineIndicator','CAFFEINE'],['WindowPreview','WindowPreview','PREVIEW']])modules['./'+file]={[name]:tag(marker)};
modules['./ActiveAppEditor']=evaluate('src/components/ActiveAppEditor.tsx',{'../appearance':appearance});
const {DockBar}=evaluate('src/components/DockBar.tsx',modules);
function render(extra={}) {
  const settings={...config,enabledExtensions:enabled,showMusic:true,showClocks:true,showBattery:true,showDockArea:false,showTerminalIcon:false,showCaffeine:false,showSetSwitcher:false,showSimIcons:false,showSpaces:false,showSettingsCog:false,...extra};
  return renderToStaticMarkup(React.createElement(DockBar,{config:settings,activeSet:settings.sets[0]}));
}
installed=['time','media','power'];enabled=[...installed,'apps-drawer'];let html=render();for(const name of installed){assert.equal(html.split('EXT_'+name).length-1,1);}for(const name of ['TIME','MEDIA','POWER'])assert.ok(!html.includes('NATIVE_'+name));assert.ok(polling.every(([,on])=>on===false));
enabled=['apps-drawer'];html=render();for(const name of ['TIME','MEDIA','POWER'])assert.ok(!html.includes('NATIVE_'+name));assert.ok(!html.includes('EXT_time'));
installed=[];enabled=['apps-drawer'];html=render();for(const name of ['TIME','MEDIA','POWER'])assert.ok(html.includes('NATIVE_'+name));
console.log('PASS: one-time visibility migration, disabled choices preserved, original clock list/order retained, one rendered feature per extension, no native fallback when disabled, no duplicate native polling, fallback only when uninstalled.');

installed=['time','apps-drawer','floatnote'];enabled=[...installed];
const appSet={id:'empty',name:'Empty',items:[{id:'a',name:'A',path:'/A.app',order:0},{id:'b',name:'B',path:'/B.app',order:1}]};
const interleaved=[layout.extensionItemId('floatnote'),layout.appItemId('empty','a'),layout.extensionItemId('time'),layout.appItemId('empty','b'),layout.extensionItemId('apps-drawer')];
for(const position of ['left','bottom']) {
  const rendered=render({position,sets:[appSet],showDockArea:true,barOrder:interleaved});
  const indices=interleaved.map(id=>rendered.indexOf('data-bb-item="'+id+'"'));
  assert.ok(indices.every(index=>index>=0),indices);assert.deepEqual([...indices].sort((a,b)=>a-b),indices);
  assert.equal((rendered.match(/EXT_time/g)||[]).length,1);assert.ok(!rendered.includes('NATIVE_TIME'));
}
console.log('PASS: horizontal and vertical bar render extensions between individual pinned apps in saved order.');
