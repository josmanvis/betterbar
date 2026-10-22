const ROOT = require("node:path").resolve(__dirname, "..");
const fs=require('node:fs'),assert=require('node:assert/strict');
const req=require('node:module').createRequire(ROOT+"/package.json");
const React=req('react'),{transform}=req('sucrase'),{renderToStaticMarkup}=req('react-dom/server');
function evaluate(path,modules={}) {
 const code=transform(fs.readFileSync(ROOT+"/"+path,'utf8'),{transforms:['typescript','jsx','imports'],jsxPragma:'React.createElement',jsxFragmentPragma:'React.Fragment'}).code;
 const exports={};new Function('exports','require','React',code)(exports,id=>{assert.ok(id in modules,id);return modules[id];},React);return exports;
}
const a=evaluate('src/appearance.ts');
const types=evaluate('src/types.ts');
const store=evaluate('src/store.ts',{react:React,'./types':types,'./appearance':a,'./extensions-runtime':{},'./extension-replacements':{},'./bar-layout':evaluate('src/bar-layout.ts',{'./types':types,'./extension-replacements':evaluate('src/extension-replacements.ts')}),'./tauri-bridge':{setOpenOnLogin:async()=>{}}});
let config=store.sanitize({...types.DEFAULT_CONFIG,transparentBg:true});assert.equal(config.appearance.opacity,35);assert.equal(config.appearance.blur,12);
config=store.sanitize({...config,appearance:{palette:{text:'bad',background:'#123456'},opacity:500,blur:-10,radius:NaN,borderWidth:9,shadow:50},extensionAppearance:{timesheets:{colors:{accent:'#f01234',text:'invalid',bogus:'#123456'},opacity:-20,iconScale:10}}});
assert.equal(config.appearance.opacity,100);assert.equal(config.appearance.blur,0);assert.equal(config.appearance.palette.text,a.PALETTE.text);assert.equal(config.appearance.radius,0);assert.equal(config.appearance.borderWidth,4);
assert.deepEqual(config.extensionAppearance.timesheets,{colors:{accent:'#f01234'},opacity:0,iconScale:1.5});
assert.equal(a.themeStyle(config,'timesheets')['--bb-accent'],'#f01234');assert.equal(a.themeStyle(config,'timesheets')['--bb-text'],a.PALETTE.text);
assert.equal(a.themeStyle({...config,accentColor:'#000000'})['--bb-on-accent'],'#fafafa');assert.equal(a.themeStyle({...config,accentColor:'#ffffff'})['--bb-on-accent'],'#101010');
config.appearance.opacity=42;config.appearance.blur=20;
const surface=a.barSurface(config);assert.equal(surface.backgroundColor,'rgba(18,52,86,0.42)');assert.equal(surface.opacity,undefined);assert.equal(surface.backdropFilter,'blur(20px)');
assert.deepEqual(store.sanitize(JSON.parse(JSON.stringify(config))).appearance,config.appearance);
const editor=evaluate('src/components/AppearanceEditor.tsx',{'../appearance':a});
function nodes(node) { if(!node||typeof node!=='object') return [];if(typeof node.type==='function')return nodes(node.type(node.props));return [node,...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
let patches=[];
let tree=editor.AppearanceEditor({config,update:patch=>patches.push(patch)});
let inputs=nodes(tree).filter(n=>n.type==='input');
inputs.find(n=>n.props['aria-label']==='Background opacity').props.onChange({target:{value:'17'}});assert.equal(patches.at(-1).appearance.opacity,17);assert.equal(patches.at(-1).appearance.palette.background,'#123456');
inputs.find(n=>n.props['aria-label']==='Primary text').props.onChange({target:{value:'#987654'}});assert.equal(patches.at(-1).appearance.palette.text,'#987654');assert.equal(patches.at(-1).appearance.opacity,42);
config={...config,extensionAppearance:{...config.extensionAppearance,floatnote:{opacity:75}}};
tree=editor.ExtensionAppearanceEditor({config,name:'timesheets',label:'Timesheets',update:patch=>patches.push(patch)});
inputs=nodes(tree).filter(n=>n.type==='input');inputs.find(n=>n.props['aria-label']==='Timesheets content size').props.onChange({target:{value:'85'}});
assert.equal(patches.at(-1).extensionAppearance.timesheets.iconScale,.85);assert.equal(patches.at(-1).extensionAppearance.floatnote.opacity,75);
assert.ok(renderToStaticMarkup(tree).includes('Use custom colors'));
console.log('PASS: legacy transparency migration, validation/clamping, palette inheritance and overrides, contrast colors, background-only opacity, persistence, and editor callbacks.');
