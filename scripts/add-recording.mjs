import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {validateRecording,exportRecording,missionTiming} from '../extension/core.js';
import {validateCatalog,digest} from '../extension/sharing.js';
const args=process.argv.slice(2),option=name=>{const at=args.indexOf(name);return at>=0?args[at+1]:undefined;};
const file=option('--file'),slug=option('--slug'),author=option('--author'),revision=option('--revision')||'1';
if(!file||!slug||!author||!/^[a-zA-Z0-9_-]+$/.test(slug)||slug==='index'||author.length>100||revision.length>80){console.error('Usage: npm run add-recording -- --file /path/mission.json --slug easter-island --author GitHubName --revision 1 [--replace]');process.exit(1);}
try{
  if((await stat(file)).size>25000000)throw Error('File exceeds 25 MB.');
  const parsed=validateRecording(JSON.parse(await readFile(file,'utf8')));missionTiming(parsed);
  const recording=exportRecording(parsed,{notes:parsed.notes||''});
  const relative=`recordings/${slug}.json`,destination=path.resolve(relative);
  const catalog=validateCatalog(JSON.parse(await readFile('recordings/index.json','utf8')));
  if(catalog.some(e=>e.path===relative)&&!args.includes('--replace'))throw Error('This recording already exists. Use --replace to publish an intentional update.');
  const raw=JSON.stringify(recording,null,2)+'\n';
  const entry={name:recording.name,path:relative,author,revision,sha256:await digest(raw),description:option('--description')||'Community recording; read its starting instructions before replay.'};
  const next=[...catalog.filter(e=>e.path!==relative),entry].sort((a,b)=>a.name.localeCompare(b.name));validateCatalog(next);
  await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination,raw);await writeFile('recordings/index.json',JSON.stringify(next,null,2)+'\n');
  console.log(`Added ${relative} and its catalog checksum. Review the diff, run npm run check, then commit/push to publish.`);
}catch(error){console.error(error.message);process.exit(1);}
