import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID,timingSafeEqual,scryptSync} from 'node:crypto';
import {config} from './config.mjs';
import {openStore,availability,minutes,token,hash,nextYear,today,runReminders,deliver} from './store.mjs';
export function createApp({dbPath=process.env.DB_PATH||'./data/hanzelmoto.sqlite',password=process.env.ADMIN_PASSWORD,base=process.env.PUBLIC_URL||'http://localhost:3000'}={}){
const store=openStore(dbPath),{db,queue,audit}=store;const sessions=new Map(),limits=new Map();
const passwordHash=password&&password.length>=16?scryptSync(password,'hanzelmoto-admin',64):null;
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const fail=(status,message)=>Object.assign(Error(message),{status});
const session=req=>{const id=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hm_session='))?.slice(11);const s=sessions.get(id);return s&&s.expires>Date.now()?{id,...s}:null;};
const limited=(req,key,max)=>{const k=req.socket.remoteAddress+key;let v=limits.get(k);if(!v||v.until<Date.now())v={n:0,until:Date.now()+900000};v.n++;limits.set(k,v);if(limits.size>10000)for(const [k,v] of limits)if(v.until<Date.now())limits.delete(k);if(v.n>max)throw fail(429,'Príliš veľa pokusov. Skúste to o 15 minút.');};
const clean=(v,max=150)=>typeof v==='string'?v.trim().slice(0,max):'';
const identity=b=>{const x={name:clean(b.name,100),email:clean(b.email,180).toLowerCase(),phone:clean(b.phone,30),bike:clean(b.bike,120),notes:clean(b.notes,1000)};if(x.name.length<2||!/^\S+@\S+\.\S+$/.test(x.email)||x.bike.length<2)throw fail(400,'Skontrolujte meno, e-mail a motocykel.');return x;};
function signup(x,due){
  const existing=db.prepare('SELECT * FROM subscribers WHERE email=?').get(x.email);if(existing?.state==='active')return;
  const confirm=token(),unsub=token(),id=existing?.id||randomUUID(),now=new Date().toISOString();
  db.prepare(`INSERT INTO subscribers(id,email,name,bike,state,confirm_hash,unsubscribe_hash,requested,due,version,consent_text) VALUES(?,?,?,?,'pending',?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,bike=excluded.bike,state='pending',confirm_hash=excluded.confirm_hash,unsubscribe_hash=excluded.unsubscribe_hash,requested=excluded.requested,confirmed=NULL,revoked=NULL,due=excluded.due,version=excluded.version,consent_text=excluded.consent_text`).run(id,x.email,x.name,x.bike,hash(confirm),unsub,now,due,config.consentVersion,config.consentText);
  queue(x.email,'Potvrďte pripomienky údržby | HANZELMOTO',`Súhlas: ${config.consentText}\nPotvrďte do 7 dní: ${base}/?confirm=${confirm}\nAk ste o pripomienky nepožiadali, správu ignorujte.`, 'consent-'+randomUUID(),id);audit('consent.requested',id);
}
const server=http.createServer(async(req,res)=>{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https://images.unsplash.com data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
try{
 const u=new URL(req.url,base),p=u.pathname;let b={};
 if(req.method==='POST'){
  if(req.headers.origin&&req.headers.origin!==new URL(base).origin)throw fail(403,'Neplatný pôvod požiadavky.');
  if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'Vyžaduje sa JSON.');
  let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)throw fail(413,'Príliš veľká požiadavka.');}try{b=JSON.parse(body||'{}');}catch{throw fail(400,'Neplatné údaje.');}
 }
 if(p==='/runtime.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end('window.HM_DEMO = false;');}
 if(p==='/api/config')return send(res,200,{...config,mode:'server',mailMode:process.env.MAIL_RELAY_URL?'relay-configured':'outbox-only'});
 if(p==='/api/availability')return send(res,200,{slots:availability(db,u.searchParams.get('service'),u.searchParams.get('date'))});
 if(p==='/api/bookings'&&req.method==='POST'){
  limited(req,'booking',20);if(b.website)throw fail(400,'Neplatný formulár.');const x=identity(b);if(!/^[+\d\s()-]{7,30}$/.test(x.phone))throw fail(400,'Skontrolujte telefónne číslo.');
  const svc=config.services.find(s=>s.id===b.service);if(!svc)throw fail(400,'Vyberte službu.');const id=randomUUID(),cancel=token();
  db.exec('BEGIN IMMEDIATE');try{
   if(!availability(db,b.service,b.date).includes(b.time))throw fail(409,'Tento termín už nie je dostupný. Vyberte iný.');
   db.prepare('INSERT INTO bookings(id,service,date,time,duration,name,email,phone,bike,notes,created,cancel_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,b.service,b.date,b.time,svc.duration,x.name,x.email,x.phone,x.bike,x.notes,new Date().toISOString(),hash(cancel));
   for(let n=minutes(b.time);n<minutes(b.time)+svc.duration;n+=config.schedule.step)db.prepare('INSERT INTO slots VALUES(?,?,?)').run(b.date,n,id);
   queue(x.email,'Žiadosť o termín | HANZELMOTO',`Prijali sme žiadosť: ${svc.name}, ${b.date} ${b.time}. Servis termín ešte potvrdí.\nSpráva rezervácie: ${base}/?cancel=${cancel}`,'booking-'+id);
   if(b.reminders===true)signup(x,nextYear(b.date));audit('booking.created',id);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return send(res,201,{id,cancelUrl:`${base}/?cancel=${cancel}`,status:'pending',mailMode:process.env.MAIL_RELAY_URL?'relay-configured':'outbox-only'});
 }
 if(p==='/api/subscribe'&&req.method==='POST'){limited(req,'subscribe',10);if(b.consent!==true||b.website)throw fail(400,'Pre pripomienky je potrebný dobrovoľný súhlas.');const x=identity(b);signup(x,nextYear(today()));return send(res,200,{ok:true});}
 if(p==='/api/consent'&&req.method==='POST'){
  limited(req,'token',40);const t=clean(b.token,64);if(!/^[a-f0-9]{64}$/.test(t))throw fail(400,'Neplatný odkaz.');
  if(b.action==='confirm'){const s=db.prepare('SELECT * FROM subscribers WHERE confirm_hash=?').get(hash(t));if(!s||s.state!=='pending'||Date.now()-Date.parse(s.requested)>7*864e5)throw fail(400,'Odkaz je neplatný alebo vypršal.');db.prepare("UPDATE subscribers SET state='active',confirmed=?,confirm_hash='' WHERE id=?").run(new Date().toISOString(),s.id);audit('consent.confirmed',s.id);}
  else if(b.action==='unsubscribe'){const s=db.prepare('SELECT * FROM subscribers WHERE unsubscribe_hash=?').get(t);if(!s)throw fail(400,'Neplatný odkaz.');db.prepare("UPDATE subscribers SET state='revoked',revoked=? WHERE id=?").run(new Date().toISOString(),s.id);db.prepare("UPDATE outbox SET status='suppressed' WHERE subscriber=? AND status='queued'").run(s.id);audit('consent.revoked',s.id);}
  else throw fail(400,'Neplatná akcia.');return send(res,200,{ok:true});
 }
 if(p==='/api/cancel'&&req.method==='POST'){
  limited(req,'cancel',40);const bk=db.prepare('SELECT * FROM bookings WHERE cancel_hash=?').get(hash(clean(b.token,64)));if(!bk)throw fail(404,'Rezervácia sa nenašla.');
  db.exec('BEGIN IMMEDIATE');try{if(['completed'].includes(bk.status))throw fail(409,'Ukončený servis už nie je možné zrušiť.');db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(bk.id);db.prepare('DELETE FROM slots WHERE booking=?').run(bk.id);audit('booking.cancelled',bk.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(res,200,{ok:true});
 }
 if(p==='/api/admin/login'&&req.method==='POST'){
  limited(req,'login',8);if(!passwordHash)throw fail(503,'Správca musí nastaviť ADMIN_PASSWORD (min. 16 znakov).');const candidate=scryptSync(clean(b.password,300),'hanzelmoto-admin',64);if(!timingSafeEqual(candidate,passwordHash))throw fail(401,'Nesprávne heslo.');const id=token(),csrf=token();sessions.set(id,{csrf,expires:Date.now()+8*36e5});res.setHeader('Set-Cookie',`hm_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return send(res,200,{csrf});
 }
 if(p.startsWith('/api/admin/')){
  const s=session(req);if(!s)throw fail(401,'Prihláste sa do administrácie.');if(req.method==='POST'&&req.headers['x-csrf-token']!==s.csrf)throw fail(403,'Obnovte prihlásenie.');
  if(p.endsWith('/state'))return send(res,200,{csrf:s.csrf,bookings:db.prepare('SELECT id,service,date,time,duration,name,email,phone,bike,notes,status FROM bookings ORDER BY date,time').all(),subscribers:db.prepare('SELECT id,email,name,bike,state,due,requested,confirmed,revoked,version FROM subscribers').all(),blocks:db.prepare('SELECT * FROM blocks ORDER BY date').all(),outbox:db.prepare('SELECT * FROM outbox ORDER BY created DESC LIMIT 100').all(),audit:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all()});
  if(p.endsWith('/logout')){sessions.delete(s.id);res.setHeader('Set-Cookie','hm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});}
  if(p.endsWith('/booking')&&req.method==='POST'){
   const bk=db.prepare('SELECT * FROM bookings WHERE id=?').get(b.id);if(!bk)throw fail(404,'Rezervácia neexistuje.');
   const allowed={pending:['confirmed','cancelled'],confirmed:['completed','cancelled']};if(!allowed[bk.status]?.includes(b.status))throw fail(409,'Nepovolená zmena stavu.');
   db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE bookings SET status=? WHERE id=?').run(b.status,b.id);if(b.status==='cancelled')db.prepare('DELETE FROM slots WHERE booking=?').run(b.id);if(b.status==='completed')db.prepare("UPDATE subscribers SET due=? WHERE email=? AND state='active'").run(nextYear(bk.date),bk.email);queue(bk.email,'Zmena rezervácie | HANZELMOTO',`Rezervácia ${bk.date} ${bk.time}: ${{confirmed:'potvrdená',completed:'servis ukončený',cancelled:'zrušená'}[b.status]}. Kontakt: ${config.business.phone}`,'status-'+b.id+'-'+b.status);audit('booking.'+b.status,b.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(res,200,{ok:true});
  }
  if(p.endsWith('/block')&&req.method==='POST'){if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||Number.isNaN(Date.parse(b.date)))throw fail(400,'Neplatný dátum.');if(b.remove)db.prepare('DELETE FROM blocks WHERE date=?').run(b.date);else{if(db.prepare('SELECT 1 FROM slots WHERE date=?').get(b.date))throw fail(409,'Deň obsahuje rezervácie. Najprv ich vyriešte.');db.prepare('INSERT OR REPLACE INTO blocks VALUES(?,?)').run(b.date,clean(b.reason,100)||'Zatvorené');}audit('schedule.changed',b.date);return send(res,200,{ok:true});}
  if(p.endsWith('/reminders')&&req.method==='POST'){runReminders(store,base);return send(res,200,{ok:true});}
  if(p.endsWith('/deliver')&&req.method==='POST')return send(res,200,await deliver(store));
 }
 if(p.startsWith('/api/'))throw fail(404,'Nenájdené.');
 if(!['GET','HEAD'].includes(req.method))throw fail(405,'Nepovolená metóda.');
 const files={'/':'index.html','/admin':'index.html','/app.js':'app.js','/styles.css':'styles.css','/design-v2.css':'design-v2.css','/favicon.svg':'favicon.svg'};const file=files[p];if(!file)throw fail(404,'Nenájdené.');
 const body=await readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
}catch(e){send(res,e.status||500,{error:e.status?e.message:'Nastala chyba. Skúste to znova alebo nám zavolajte.'});if(!e.status)console.error(e);}
});return {server,store};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {server}=createApp();server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`HANZELMOTO: ${process.env.PUBLIC_URL||'http://localhost:3000'}`));}
