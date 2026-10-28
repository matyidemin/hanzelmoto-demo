import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.mjs';
export const token = () => randomBytes(32).toString('hex');
export const hash = x => createHash('sha256').update(x).digest('hex');
export function openStore(path) {
  mkdirSync(dirname(path), { recursive:true });
  const db=new DatabaseSync(path); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, service TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, duration INTEGER NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, bike TEXT NOT NULL, notes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created TEXT NOT NULL, cancel_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS slots(date TEXT NOT NULL, minute INTEGER NOT NULL, booking TEXT NOT NULL REFERENCES bookings(id), PRIMARY KEY(date,minute));
  CREATE TABLE IF NOT EXISTS blocks(date TEXT PRIMARY KEY, reason TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS subscribers(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, bike TEXT NOT NULL, state TEXT NOT NULL, confirm_hash TEXT NOT NULL, unsubscribe_hash TEXT NOT NULL, requested TEXT NOT NULL, confirmed TEXT, revoked TEXT, due TEXT NOT NULL, version TEXT NOT NULL, consent_text TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL, subscriber TEXT, status TEXT NOT NULL DEFAULT 'queued', created TEXT NOT NULL, sent TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, UNIQUE(kind,subscriber));
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL);`);
  const audit=(action,target)=>db.prepare('INSERT INTO audit(at,action,target) VALUES(?,?,?)').run(new Date().toISOString(),action,target);
  const queue=(recipient,subject,body,kind,subscriber=null)=>db.prepare('INSERT OR IGNORE INTO outbox(id,recipient,subject,body,kind,subscriber,created) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),recipient,subject,body,kind,subscriber,new Date().toISOString());
  return {db,audit,queue};
}
export function today() { return new Intl.DateTimeFormat('en-CA',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function localEpoch(date,time) {
  // Resolve the workshop's wall clock using Intl, including DST; all offered hours are daytime.
  let t=Date.parse(`${date}T${time}:00Z`);
  const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<2;i++) t+=Date.parse(`${date}T${time}:00Z`)-Date.parse(fmt.format(new Date(t)).replace(' ','T')+'Z');
  return t;
}
export const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
export const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export function availability(db,service,date) {
  const svc=config.services.find(s=>s.id===service);
  if(!svc || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const day=new Date(date+'T12:00:00Z');
  if(Number.isNaN(+day)||day.toISOString().slice(0,10)!==date||!config.schedule.weekdays.includes(day.getUTCDay())||date<today()||+day>Date.now()+config.schedule.horizonDays*864e5||db.prepare('SELECT 1 FROM blocks WHERE date=?').get(date)) return [];
  const occupied=new Set(db.prepare('SELECT minute FROM slots WHERE date=?').all(date).map(r=>r.minute)); const result=[];
  for(let m=config.schedule.start*60;m+svc.duration<=config.schedule.end*60;m+=config.schedule.step){
    if(localEpoch(date,clock(m))<Date.now()+config.schedule.leadHours*36e5)continue;
    let free=true;for(let n=m;n<m+svc.duration;n+=config.schedule.step)if(occupied.has(n))free=false;
    if(free)result.push(clock(m));
  }return result;
}
export function nextYear(date){const d=new Date(date+'T12:00:00Z');const month=d.getUTCMonth();d.setUTCFullYear(d.getUTCFullYear()+1);if(d.getUTCMonth()!==month)d.setUTCDate(0);return d.toISOString().slice(0,10);}
export function runReminders(store,base) {
  const {db,queue,audit}=store;
  db.exec('BEGIN IMMEDIATE');try{
    for(const s of db.prepare("SELECT * FROM subscribers WHERE state='active' AND due<=?").all(today())){
      queue(s.email,'Čas na pravidelný servis | HANZELMOTO',`Dobrý deň ${s.name}, pripomíname ročnú údržbu ${s.bike}. Termín: ${base}/#rezervacia\nOdhlásenie: ${base}/?unsubscribe=${s.unsubscribe_hash}`,`annual-${s.due}`,s.id);
      db.prepare('UPDATE subscribers SET due=? WHERE id=?').run(nextYear(today()),s.id);audit('reminder.queued',s.id);
    }db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export async function deliver(store) {
  if(!process.env.MAIL_RELAY_URL)return {mode:'outbox-only',sent:0};
  const url=new URL(process.env.MAIL_RELAY_URL);if(url.protocol!=='https:')throw Error('Mail relay requires HTTPS');
  let sent=0;
  for(const m of store.db.prepare("SELECT * FROM outbox WHERE status='queued' AND attempts<5 ORDER BY created LIMIT 25").all()){
    if(m.kind.startsWith('annual-')&& !store.db.prepare("SELECT 1 FROM subscribers WHERE id=? AND state='active'").get(m.subscriber)){store.db.prepare("UPDATE outbox SET status='suppressed' WHERE id=?").run(m.id);continue;}
    try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.MAIL_RELAY_TOKEN||''}`,'Idempotency-Key':m.id},body:JSON.stringify({id:m.id,to:m.recipient,subject:m.subject,text:m.body}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Relay HTTP '+r.status);store.db.prepare("UPDATE outbox SET status='sent',sent=?,attempts=attempts+1,last_error=NULL WHERE id=?").run(new Date().toISOString(),m.id);sent++;}
    catch(e){store.db.prepare('UPDATE outbox SET attempts=attempts+1,last_error=? WHERE id=?').run(String(e.message).slice(0,150),m.id);}
  }return {mode:'relay',sent};
}
