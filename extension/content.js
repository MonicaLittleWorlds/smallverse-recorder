(() => {
  if (globalThis.__svRecorder) return;
  globalThis.__svRecorder = true;
  let mode='idle', started=0, pendingText=null, textTimer, lastMove=0, lastCheckpoint='', observerTimer=null, lastClick=null, overlay, status,markFinal,markStart;
  const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
  const sensitive=e=>e?.closest?.('input[type="password"],input[autocomplete*="password"],input[autocomplete^="cc-"],[data-private]');
  const own=e=>e?.closest?.('#sv-recorder-overlay');
  const editable=e=>e?.matches?.('input,textarea,[contenteditable="true"]');
  const visible=e=>!!e?.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
  function visibleDialogs(){return [...document.querySelectorAll('[role="dialog"],dialog')].filter(visible);}
  function dialogCheckpoint(dialog){
    return {title:norm(dialog.querySelector('h1,h2,h3,[role="heading"]')?.textContent).slice(0,500),text:[...dialog.querySelectorAll('p')].map(p=>norm(p.textContent)).filter(Boolean).join('\n').slice(0,4000)};
  }
  function checkpoint(){
    const dialogs=visibleDialogs();
    const dialog=dialogs.find(d=>d.querySelector('h1,h2,h3,[role="heading"]'));
    return dialog?dialogCheckpoint(dialog):{title:'',text:''};
  }
  function target(e){
    if(!(e instanceof Element)||sensitive(e)||own(e))return null;
    const control=e.closest('button,a,input,textarea,select,[role="button"],[role="checkbox"],[contenteditable="true"]');
    if(!control)return null; // Canvas and unlabeled world surfaces use visual targets.
    const d={tag:control.tagName.toLowerCase(),role:control.getAttribute('role')||'',aria:control.getAttribute('aria-label')||'',title:control.getAttribute('title')||'',placeholder:control.getAttribute('placeholder')||'',text:norm(control.textContent).slice(0,160),type:control.getAttribute('type')||''};
    const dialog=control.closest('[role="dialog"],dialog');
    if(dialog){d.dialog=norm(dialog.querySelector('h1,h2,h3,[role="heading"]')?.textContent);d.dialogText=dialogCheckpoint(dialog).text;}
    if(!d.aria&&!d.title&&!d.placeholder&&!d.text){
      // Scoped structural fallback is only allowed inside a named dialog.
      if(!d.dialog)return null;
      d.index=[...dialog.querySelectorAll(d.tag)].indexOf(control);
    }
    return d;
  }
  function resolve(d){
    if(!d || !/^[a-z]+$/.test(d.tag))return null;
    let scope=document;
    if(d.dialog){const ds=[...document.querySelectorAll('[role="dialog"],dialog')].filter(e=>visible(e)&&norm(e.querySelector('h1,h2,h3,[role="heading"]')?.textContent)===d.dialog&&(d.dialogText===undefined||norm(dialogCheckpoint(e).text)===norm(d.dialogText)));if(ds.length!==1)return null;scope=ds[0];}
    let els=[...scope.querySelectorAll(d.tag)].filter(e=>visible(e)&&!own(e)&&!sensitive(e));
    for(const [key,attr] of [['role','role'],['aria','aria-label'],['title','title'],['placeholder','placeholder'],['type','type']]) if(d[key])els=els.filter(e=>e.getAttribute(attr)===d[key]);
    if(d.text)els=els.filter(e=>norm(e.textContent).slice(0,160)===d.text);
    if(d.index!==undefined){const el=scope.querySelectorAll(d.tag)[d.index];els=els.filter(e=>e===el);}
    return els.length===1 ? els[0]:null;
  }
  const mods=e=>(e.altKey?1:0)|(e.ctrlKey?2:0)|(e.metaKey?4:0)|(e.shiftKey?8:0);
  const send=data=>chrome.runtime.sendMessage(data).catch(()=>{});
  function emit(step){if(mode!=='recording')return;send({kind:'event',step:{...step,at:Math.max(0,Date.now()-started),url:location.href}});}
  function flushText(){clearTimeout(textTimer);if(pendingText){emit(pendingText);pendingText=null;}}
  function setMode(next){mode=next; if(!overlay)makeOverlay();overlay.hidden=mode==='idle';markFinal.hidden=markStart.hidden=mode!=='recording';}
  function makeOverlay(){
    overlay=document.createElement('div');overlay.id='sv-recorder-overlay';
    Object.assign(overlay.style,{position:'fixed',top:'48px',left:'10px',zIndex:'2147483647',background:'#f6f6f2',color:'#282b26',border:'1px solid #b6bcb0',borderRadius:'4px',padding:'8px',font:'12px system-ui',maxWidth:'290px'});
    status=document.createElement('span');overlay.append(status);
    const stop=document.createElement('button');stop.textContent='Stop';stop.style.marginLeft='10px';stop.onclick=()=>send({kind:'stop'});overlay.append(stop);
    markStart=document.createElement('button');markStart.textContent='Mission accepted';markStart.title='Press after accepting, when the first active objective is visible';markStart.onclick=()=>{flushText();send({kind:'markMissionStart'});};overlay.append(markStart);
    markFinal=document.createElement('button');markFinal.textContent='Final task starts here';markFinal.title='Press BEFORE the first action of the final task, not after mission completion';markFinal.onclick=()=>{flushText();send({kind:'markFinalTask'});};overlay.append(markFinal);
    document.documentElement.append(overlay);
  }
  for(const type of ['pointerdown','pointerup','pointermove'])document.addEventListener(type,e=>{
    if(mode!=='recording'||!e.isTrusted||own(e.target)||sensitive(e.target))return;
    if(type==='pointermove'&&!e.buttons)return; // Preserve every delivered drag sample, including fast pans.
    flushText();
    let clickCount; if(type==='pointerdown'){const now=Date.now();clickCount=lastClick&&now-lastClick.at<450&&Math.hypot(e.clientX-lastClick.x,e.clientY-lastClick.y)<5?Math.min(lastClick.count+1,2):1;lastClick={at:now,x:e.clientX,y:e.clientY,count:clickCount};}else if(type==='pointerup')clickCount=lastClick?.count||1;
    emit({type,clickCount,x:e.clientX,y:e.clientY,button:['left','middle','right'][e.button]||'none',buttons:e.buttons,modifiers:mods(e),...(type==='pointerdown'?{target:target(e.target),checkpoint:e.target.closest('[role="dialog"],dialog')?dialogCheckpoint(e.target.closest('[role="dialog"],dialog')):checkpoint()}:{})});
  },true);
  document.addEventListener('wheel',e=>{
    if(mode!=='recording'||!e.isTrusted||own(e.target)||sensitive(e.target))return;
    flushText();const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;
    emit({type:'wheel',x:e.clientX,y:e.clientY,deltaX:e.deltaX*unit,deltaY:e.deltaY*unit,modifiers:mods(e)});
  },{capture:true,passive:true});
  document.addEventListener('input',e=>{
    if(mode!=='recording'||!e.isTrusted||sensitive(e.target)||own(e.target)||!editable(e.target))return;
    const d=target(e.target);if(!d)return;
    pendingText={type:'text',value:String(e.target.value??e.target.textContent).slice(0,10000),target:d,checkpoint:checkpoint()};
    clearTimeout(textTimer);textTimer=setTimeout(flushText,180);
  },true);
  for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{
    if(e.key==='Escape'&&mode!=='idle'){send({kind:'stop'});return;}
    if(mode!=='recording'||!e.isTrusted||own(e.target)||sensitive(e.target)||e.ctrlKey||e.metaKey||['Control','Meta','Alt'].includes(e.key))return;
    if(editable(e.target)&&!['Enter','Tab','Escape'].includes(e.key))return; // input events capture final field value, including paste/IME.
    flushText();emit({type,key:e.key,code:e.code,keyCode:e.keyCode,repeat:e.repeat,modifiers:mods(e),target:target(e.target),checkpoint:type==='keydown'?checkpoint():undefined});
  },true);
  new MutationObserver(()=>{
    if(mode!=='recording')return;
    if(observerTimer)return;observerTimer=setTimeout(()=>{
      observerTimer=null;
      const cp=checkpoint(),key=JSON.stringify({cp,dialogs:visibleDialogs().map(dialogCheckpoint)});
      if(key!==lastCheckpoint){flushText();lastCheckpoint=key;emit({type:'checkpoint',checkpoint:cp});}
    },160);
  }).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  chrome.runtime.onMessage.addListener((m,_sender,reply)=>{
    if(m.kind==='probe')reply({url:location.href,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},checkpoint:checkpoint(),dialogs:visibleDialogs().map(d=>{const cp=dialogCheckpoint(d);return cp.title||cp.text?cp:{title:'[Untitled dialog]',text:norm(d.textContent).slice(0,4000)};})});
    else if(m.kind==='mode'){
      if(m.mode==='recording'&&mode!=='recording'){started=m.started;lastCheckpoint=JSON.stringify({cp:checkpoint(),dialogs:visibleDialogs().map(dialogCheckpoint)});}
      if(m.mode!=='recording')flushText();setMode(m.mode);status.textContent=m.label||m.mode;reply({ok:true});
    } else if(m.kind==='flush'){flushText();reply({ok:true});}
    else if(m.kind==='resolve'){
      const el=resolve(m.target);
      if(!el||el.disabled){reply(null);return;}
      const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      const hit=document.elementFromPoint(x,y);
      if(x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!(hit===el||el.contains(hit))){reply(null);return;}
      reply({x,y,editable:editable(el),value:el.value??el.textContent});
    }else if(m.kind==='focus'){
      const el=resolve(m.target);if(!el){reply({ok:false});return;}el.focus();reply({ok:true});
    }else if(m.kind==='selectText'){
      const el=resolve(m.target);
      if(!el||!editable(el)){reply({ok:false});return;}
      el.focus();
      if(typeof el.select==='function')el.select();
      else{const range=document.createRange();range.selectNodeContents(el);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}
      reply({ok:true});
    }
  });
  // Keep the recording worker awake even while the player waits on a task.
  setInterval(()=>{if(mode==='recording')send({kind:'contentReady'});},10000);
  send({kind:'contentReady'});
})();
