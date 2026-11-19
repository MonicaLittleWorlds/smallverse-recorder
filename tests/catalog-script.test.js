import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {digest} from '../extension/sharing.js';
test('maintainer import creates a verifiable catalog entry and requires explicit replacement',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sv-catalog-'));
  try{
    await mkdir(join(dir,'recordings'));await writeFile(join(dir,'recordings/index.json'),'[]');
    const r={format:'smallverse-mission',version:2,name:'Example',startURL:'https://smallverse.app/space/demo',viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:true,steps:[{type:'checkpoint',at:0,checkpoint:{title:'Start',text:''},missionStart:true},{type:'pointerdown',at:1,x:1,y:1,button:'left',buttons:1,completionGate:true}]};
    const input=join(dir,'input.json');await writeFile(input,JSON.stringify(r));
    const args=[fileURLToPath(new URL('../scripts/add-recording.mjs',import.meta.url)),'--file',input,'--slug','example','--author','Contributor'];
    const run=spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
    const catalog=JSON.parse(await readFile(join(dir,'recordings/index.json'),'utf8'));
    assert.equal(catalog[0].sha256,await digest(await readFile(join(dir,'recordings/example.json'),'utf8')));
    assert.equal(spawnSync(process.execPath,args,{cwd:dir}).status,1);
    assert.equal(spawnSync(process.execPath,[...args,'--replace'],{cwd:dir}).status,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
