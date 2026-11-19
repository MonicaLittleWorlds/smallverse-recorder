import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {validateCatalog,digest} from '../extension/sharing.js';
import {validateRecording,missionTiming} from '../extension/core.js';
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);assert(!manifest.host_permissions.includes('<all_urls>'));
for(const entry of await readdir('extension'))if(entry.endsWith('.js'))execFileSync(process.execPath,['--check',`extension/${entry}`]);
for(const entry of await readdir('publisher'))if(entry.endsWith('.js'))execFileSync(process.execPath,['--check',`publisher/${entry}`]);
for(const file of [manifest.background.service_worker,manifest.action.default_popup,...manifest.content_scripts.flatMap(s=>s.js)])await readFile(`extension/${file}`);
const entries=validateCatalog(JSON.parse(await readFile('recordings/index.json','utf8')));
assert(Array.isArray(entries));const paths=new Set();
for(const e of entries){assert.equal(typeof e.name,'string');assert(/^recordings\/[a-zA-Z0-9_-]+\.json$/.test(e.path));assert(!paths.has(e.path));paths.add(e.path);const raw=await readFile(e.path,'utf8');const record=validateRecording(JSON.parse(raw));missionTiming(record);if(e.sha256)assert.equal(await digest(raw),e.sha256,'Catalog checksum differs from recording');}
console.log('Extension syntax, manifest assets and public catalog validated.');
