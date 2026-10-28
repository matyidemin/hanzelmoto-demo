import {openStore,runReminders,deliver} from './store.mjs';
const s=openStore(process.env.DB_PATH||'./data/hanzelmoto.sqlite');
try{runReminders(s,process.env.PUBLIC_URL||'http://localhost:3000');console.log(await deliver(s));}finally{s.db.close();}
