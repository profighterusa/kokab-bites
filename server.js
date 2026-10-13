const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR || ROOT;
const MENU_FILE = path.join(DATA_DIR, 'menu-data.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, {recursive:true});
if (!fs.existsSync(MENU_FILE) && DATA_DIR !== ROOT) { try { fs.copyFileSync(path.join(ROOT, 'menu-data.json'), MENU_FILE); } catch {} }
const sessions = new Map();
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(JSON.stringify(obj));}
function securityHeaders(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');}
function sameOriginForAdmin(req){const origin=req.headers.origin;if(origin){try{const parsed=new URL(origin);const host=req.headers.host;if(parsed.host!==host)return false;}catch{return false;}}if(req.headers['sec-fetch-site']==='cross-site')return false;return true;}
function readBody(req,max=1024*1024){return new Promise((resolve,reject)=>{let body='',size=0;req.on('data',chunk=>{size+=chunk.length;if(size>max){reject(new Error('Body too large'));req.destroy();return;}body+=chunk;});req.on('end',()=>{try{resolve(body?JSON.parse(body):{});}catch(e){reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function writeJson(file,data){const tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});try{fs.renameSync(tmp,file);}catch(e){try{fs.unlinkSync(tmp);}catch{}throw e;}}
function tokenFrom(req){const c=req.headers.cookie||'';const m=c.match(/(?:^|;\s*)kb_admin=([^;]+)/);return m?decodeURIComponent(m[1]):'';}
function isAdmin(req){const token=tokenFrom(req),s=sessions.get(token);if(!s)return false;if(s.expires<Date.now()){sessions.delete(token);return false;}return true;}
function safeEq(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function cleanString(v,max=400){return String(v??'').trim().slice(0,max);}
const orderRate=new Map();
function rateOk(ip,limit=8,windowMs=60000){const now=Date.now(),old=orderRate.get(ip)||[];const fresh=old.filter(t=>now-t<windowMs);if(fresh.length>=limit){orderRate.set(ip,fresh);return false;}fresh.push(now);orderRate.set(ip,fresh);return true;}
const loginRate=new Map();
function loginRateOk(ip){return rateOk('login:'+ip,5,15*60*1000);}
function normKey(s){return String(s||'').trim().toLowerCase();}
const PIZZA_SPECIAL_RE=/creamy|malai boti|kebabish|bbq|doner|cheese-stuffed/i;
function buildPriceTable(menu){
  const t=new Map();
  const put=(n,o,p)=>t.set(normKey(n)+'|'+normKey(o||''),p===null||p===undefined?null:Number(p));
  for(const [n,p] of Object.entries(menu.items||{}))put(n,'',p);
  const allNames=new Set([...Object.keys(menu.items||{}),...Object.keys(menu.itemMeta||{})]);
  for(const n of allNames){
    const cat=menu.itemMeta&&menu.itemMeta[n]&&menu.itemMeta[n].category;
    if(cat==='Pizza'||/pizza/i.test(n)){
      const grp=PIZZA_SPECIAL_RE.test(n)?(menu.specialPizza||{}):(menu.classicPizza||{});
      for(const [k,v] of Object.entries(grp)){put(n,k,v&&v.price);put(n,(v&&v.label)||k,v&&v.price);}
    }
    if(n==='Loaded Fries'||n==='Wings'){const g=(menu.sides||{})[n]||{};for(const [k,v] of Object.entries(g))put(n,k,v);}
  }
  for(const [n,m] of Object.entries(menu.itemMeta||{})){
    if(!m)continue;
    for(const v of m.variants||[]){if(v&&v.active!==false)put(m.displayName||n,v.name||v.label,v.price);}
  }
  for(const p of menu.customItems||[]){
    if(!p||p.active===false)continue;
    put(p.name,'',p.price);
    for(const v of p.variants||[]){if(v&&v.active!==false)put(p.name,v.name||v.label,v.price);}
  }
  for(const [n,d] of Object.entries(menu.deals||{})){if(d&&d.active!==false)put(n,'',d.price);}
  return t;
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/api/menu')return json(res,200,readJson(MENU_FILE,{}));
  if(req.method==='POST'&&url.pathname==='/api/admin/login'){
    if(!sameOriginForAdmin(req))return json(res,403,{error:'Cross-origin admin request blocked.'});
    const loginIp=(req.socket.remoteAddress||'unknown').replace(/^::ffff:/,'');
    if(!loginRateOk(loginIp))return json(res,429,{error:'Too many sign-in attempts. Please wait 15 minutes before trying again.'});
    if(!ADMIN_PASSWORD)return json(res,503,{error:'Admin login is disabled. Set ADMIN_PASSWORD in the server environment first.'});
    try{const body=await readBody(req,4096);if(!safeEq(cleanString(body.password,256),ADMIN_PASSWORD))return json(res,401,{error:'Incorrect password'});for(const [k,v] of sessions)if(v.expires<Date.now())sessions.delete(k);if(sessions.size>=100)return json(res,503,{error:'Admin session capacity reached. Please try again later.'});const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{expires:Date.now()+12*60*60*1000});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Set-Cookie':`kb_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${IS_PRODUCTION?'; Secure':''}`});return res.end(JSON.stringify({ok:true}));}catch(e){return json(res,400,{error:e.message});}
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/logout'){if(!sameOriginForAdmin(req))return json(res,403,{error:'Cross-origin admin request blocked.'});const t=tokenFrom(req);sessions.delete(t);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`kb_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${IS_PRODUCTION?'; Secure':''}`});return res.end('{"ok":true}');}
  if(url.pathname.startsWith('/api/admin/')){
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&!sameOriginForAdmin(req))return json(res,403,{error:'Cross-origin admin request blocked.'});
    if(!isAdmin(req))return json(res,401,{error:'Please log in again.'});
    if(req.method==='GET'&&url.pathname==='/api/admin/menu')return json(res,200,readJson(MENU_FILE,{}));
    if(req.method==='POST'&&url.pathname==='/api/admin/upload'){try{const body=await readBody(req,7*1024*1024);const m=String(body.data||'').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!m)return json(res,400,{error:'Upload must be a JPG, PNG or WebP image.'});const ext=m[1]==='jpeg'?'jpg':m[1];const buf=Buffer.from(m[2],'base64');if(!buf.length||buf.length>5*1024*1024)return json(res,400,{error:'Image must be smaller than 5 MB.'});const sig=ext==='jpg'?buf.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])):ext==='png'?buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):buf.subarray(0,4).toString()==='RIFF'&&buf.subarray(8,12).toString()==='WEBP';if(!sig)return json(res,400,{error:'Image file does not match its file type.'});const name='product-'+Date.now().toString(36)+'-'+crypto.randomBytes(5).toString('hex')+'.'+ext;fs.writeFileSync(path.join(UPLOAD_DIR,name),buf,{flag:'wx',mode:0o644});return json(res,201,{ok:true,url:'/uploads/'+name});}catch(e){return json(res,400,{error:e.message});}}
    if(req.method==='PUT'&&url.pathname==='/api/admin/menu'){
      try{const data=await readBody(req);if(!data||typeof data!=='object'||!data.items||!data.classicPizza||!data.specialPizza||!data.deals)return json(res,400,{error:'Menu data is incomplete.'});
        if(!Array.isArray(data.customItems))data.customItems=[];if(data.customItems.length>500)return json(res,400,{error:'Maximum 500 custom products allowed.'});const ids=new Set(),names=new Set();for(const item of data.customItems){if(!item||typeof item!=='object'||!String(item.id||'').match(/^[a-zA-Z0-9_-]{1,100}$/)||!cleanString(item.name,90)||!['Burgers','Pizza','Shawarma & Rolls','Sides','Drinks','Desserts','Other'].includes(item.category))return json(res,400,{error:'Each product needs a valid ID, name and category.'});if(ids.has(item.id)||names.has(cleanString(item.name,90).toLowerCase()))return json(res,400,{error:'Product IDs and names must be unique.'});ids.add(item.id);names.add(cleanString(item.name,90).toLowerCase());if(item.price!==null&&item.price!==undefined&&(!Number.isFinite(Number(item.price))||Number(item.price)<0||Number(item.price)>1000000))return json(res,400,{error:'Product price must be blank or between 0 and 1,000,000.'});item.name=cleanString(item.name,90);item.description=cleanString(item.description,280);item.tag=cleanString(item.tag,28);item.image=cleanString(item.image,1000);item.active=item.active!==false;}
        const numeric=(v)=>v===null||(Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1000000);
        for(const v of Object.values(data.items))if(!numeric(v))return json(res,400,{error:'Item prices must be non-negative numbers or null.'});
        for(const group of [data.classicPizza,data.specialPizza])for(const v of Object.values(group))if(!numeric(v.price))return json(res,400,{error:'Pizza prices must be valid non-negative numbers.'});
        for(const v of Object.values(data.deals))if(!numeric(v.price))return json(res,400,{error:'Deal prices must be valid non-negative numbers.'});
        data.lastUpdated=new Date().toISOString();writeJson(MENU_FILE,data);return json(res,200,{ok:true,lastUpdated:data.lastUpdated});
      }catch(e){return json(res,400,{error:e.message});}
    }
    if(req.method==='GET'&&url.pathname==='/api/admin/orders')return json(res,200,readJson(ORDERS_FILE,[]).slice(-200).reverse());
    if(req.method==='PATCH'&&url.pathname.startsWith('/api/admin/orders/')){const id=decodeURIComponent(url.pathname.split('/').pop());try{const body=await readBody(req,4096);const orders=readJson(ORDERS_FILE,[]);const o=orders.find(x=>x.id===id);if(!o)return json(res,404,{error:'Order not found'});o.status=['New','Confirmed','Preparing','Ready','Completed','Cancelled'].includes(body.status)?body.status:o.status;o.adminNote=cleanString(body.adminNote,500);writeJson(ORDERS_FILE,orders);return json(res,200,{ok:true});}catch(e){return json(res,400,{error:e.message});}}
    return json(res,404,{error:'Admin endpoint not found'});
  }
  if(req.method==='POST'&&url.pathname==='/api/orders'){
    const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();if(!rateOk(ip))return json(res,429,{error:'Too many order attempts. Please try again shortly.'});
    try{const b=await readBody(req,16000);let items=Array.isArray(b.items)?b.items.slice(0,40).map(i=>({name:cleanString(i.name,120),option:cleanString(i.option,80),qty:Math.max(1,Math.min(99,Number(i.qty)||1)),unitPrice:i.unitPrice===null?null:(Number.isFinite(Number(i.unitPrice))&&Number(i.unitPrice)>=0?Number(i.unitPrice):null),lineTotal:i.lineTotal===null?null:(Number.isFinite(Number(i.lineTotal))&&Number(i.lineTotal)>=0?Number(i.lineTotal):null)})):[];
      if(!items.length)return json(res,400,{error:'Order needs at least one item.'});
      const menu=readJson(MENU_FILE,{}),table=buildPriceTable(menu),alias={};
      for(const [k,v] of Object.entries(menu.itemMeta||{}))if(v&&v.displayName)alias[normKey(v.displayName)]=k;
      let serverTotal=0,unverified=0;
      items=items.map(it=>{
        let key=normKey(it.name)+'|'+normKey(it.option);
        let hit=table.has(key)?table.get(key):undefined;
        if(hit===undefined){const ak=alias[normKey(it.name)];if(ak){key=normKey(ak)+'|'+normKey(it.option);hit=table.has(key)?table.get(key):undefined;}}
        const verified=hit!==undefined,unit=verified?hit:null,line=unit===null?null:unit*it.qty;
        if(verified&&unit!==null)serverTotal+=line;else unverified+=it.qty;
        return {...it,serverUnitPrice:unit,serverLineTotal:line,verified};
      });
      const deliveryFee=Number.isFinite(Number(b.deliveryFee))&&Number(b.deliveryFee)>=0?Number(b.deliveryFee):0;
      const order={id:'KB-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase(),createdAt:new Date().toISOString(),status:'New',name:cleanString(b.name,100),phone:cleanString(b.phone,40),address:cleanString(b.address,500),notes:cleanString(b.notes,800),targetBudget:Number.isFinite(Number(b.targetBudget))&&Number(b.targetBudget)>0?Number(b.targetBudget):null,clientTotal:Number.isFinite(Number(b.estimatedTotal))?Math.max(0,Number(b.estimatedTotal)):0,estimatedTotal:serverTotal,serverTotal,deliveryFee,unverifiedCount:unverified,items};const orders=readJson(ORDERS_FILE,[]);orders.push(order);writeJson(ORDERS_FILE,orders.slice(-1000));return json(res,201,{ok:true,orderId:order.id});
    }catch(e){return json(res,400,{error:e.message});}
  }
  if(req.method==='GET'&&url.pathname.startsWith('/api/track/')){
    const id=decodeURIComponent(url.pathname.split('/').pop()||'');
    const o=readJson(ORDERS_FILE,[]).find(x=>x.id===id);
    if(!o)return json(res,404,{error:'Order not found. Please check the order ID and try again.'});
    const prep=((readJson(MENU_FILE,{}).settings)||{}).prepMinutes||30;
    return json(res,200,{id:o.id,status:o.status||'New',createdAt:o.createdAt,serverTotal:o.serverTotal??o.estimatedTotal,deliveryFee:o.deliveryFee||0,unverifiedCount:o.unverifiedCount||0,prepMinutes:prep,items:(o.items||[]).map(i=>({name:i.name,option:i.option,qty:i.qty,lineTotal:i.verified===false?null:(i.serverLineTotal??i.lineTotal),verified:i.verified!==false}))});
  }
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'Invalid path'});}if(pathname==='/')pathname='/index.html';if(pathname.includes('..')||pathname.includes('\\'))return json(res,400,{error:'Invalid path'});
  const blockedFiles=new Set(['/server.js','/package.json','/orders.json','/menu-data.json','/readme.txt','/start-server.bat']);
  if(blockedFiles.has(pathname.toLowerCase())||pathname.toLowerCase().startsWith('/.env'))return json(res,404,{error:'Not found'});
  const file=path.join(ROOT,pathname);if(!file.startsWith(ROOT+path.sep))return json(res,403,{error:'Forbidden'});fs.stat(file,(err,st)=>{if(err||!st.isFile()){if(!url.pathname.startsWith('/api/')){const nf=path.join(ROOT,'404.html');if(fs.existsSync(nf)){securityHeaders(res);res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(nf).pipe(res);}}res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');}securityHeaders(res);if(pathname==='/admin.html'){res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('Pragma','no-cache');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
});
server.listen(PORT,()=>{console.log(`KOKAB BITES site running on http://localhost:${PORT}`);if(!ADMIN_PASSWORD)console.warn('Admin is disabled until ADMIN_PASSWORD is set.');if(IS_PRODUCTION&&ADMIN_PASSWORD.length<14){console.error('SECURITY ERROR: In production, ADMIN_PASSWORD must be at least 14 characters.');server.close(()=>process.exit(1));return;}if(IS_PRODUCTION)console.warn('Production mode: serve behind HTTPS; Secure session cookies are enabled.');});
