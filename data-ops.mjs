import {openStore} from './store.mjs';
const [action,email,confirm]=process.argv.slice(2);
const store=openStore(process.env.DB_PATH||'./data/hanzelmoto.sqlite'),{db}=store;
try{
 if(action==='expired-consents'){
  if(email!=='--confirm')throw Error('Review retention policy and backup first; requires --confirm.');
  db.exec('BEGIN IMMEDIATE');try{db.prepare("DELETE FROM outbox WHERE subscriber IN (SELECT id FROM subscribers WHERE state='pending' AND requested<?)").run(new Date(Date.now()-7*864e5).toISOString());const r=db.prepare("DELETE FROM subscribers WHERE state='pending' AND requested<?").run(new Date(Date.now()-7*864e5).toISOString());db.exec('COMMIT');console.log('Expired pending consents removed:',r.changes);}catch(e){db.exec('ROLLBACK');throw e;}
 }else{
  if(!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('Usage: data-ops.mjs export|erase email [--confirm]');const key=email.trim().toLowerCase();
  if(action==='export'){console.log(JSON.stringify({bookings:db.prepare('SELECT id,service,date,time,duration,name,email,phone,bike,notes,status,created FROM bookings WHERE email=?').all(key),subscriptions:db.prepare('SELECT id,email,name,bike,state,requested,confirmed,revoked,due,version,consent_text FROM subscribers WHERE email=?').all(key)},null,2));}
  else if(action==='erase'){
   if(confirm!=='--confirm')throw Error('Verify identity, workshop coordination, legal retention and backup first; requires --confirm.');
   db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM slots WHERE booking IN (SELECT id FROM bookings WHERE email=?)').run(key);db.prepare('DELETE FROM bookings WHERE email=?').run(key);db.prepare('DELETE FROM outbox WHERE recipient=?').run(key);db.prepare('DELETE FROM subscribers WHERE email=?').run(key);db.exec('COMMIT');console.log('Application records erased. Apply separate provider and backup retention policies.');}catch(e){db.exec('ROLLBACK');throw e;}
  }else throw Error('Unknown action.');
 }
}catch(e){console.error(e.message);process.exitCode=1;}finally{db.close();}
