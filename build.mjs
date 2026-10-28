import {cpSync,mkdirSync} from 'node:fs';
mkdirSync('dist',{recursive:true});
cpSync('public','dist',{recursive:true});
console.log('Static demonstration prepared in dist/. Production uses server.mjs.');
