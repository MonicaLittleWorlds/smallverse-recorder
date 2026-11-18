import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {validateRecording} from '../extension/core.js';
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);assert(!manifest.host_permissions.includes('<all_urls>'));
for(const entry of await readdir('extension'))if(entry.endsWith('.js'))execFileSync(process.execPath,['--check',`extension/${entry}`]);
for(const file of [manifest.background.service_worker,manifest.action.default_popup,...manifest.content_scripts.flatMap(s=>s.js)])await readFile(`extension/${file}`);
const entries=JSON.parse(await readFile('recordings/index.json','utf8'));
assert(Array.isArray(entries));const paths=new Set();
for(const e of entries){assert.equal(typeof e.name,'string');assert(/^recordings\/[a-zA-Z0-9_-]+\.json$/.test(e.path));assert(!paths.has(e.path));paths.add(e.path);validateRecording(JSON.parse(await readFile(e.path,'utf8')));}
console.log('Extension syntax, manifest assets and public catalog validated.');
