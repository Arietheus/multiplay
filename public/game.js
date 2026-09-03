'use strict';
const $ = (id) => document.getElementById(id);

// ---------- palette + skins (Void Shell C + SKINS) ----------
const SKINS = [
  { id:'sulfur', c:{ pit:'#171c1a',pitLit:'#1f2624',stone:'#2c3531',stoneLit:'#455049',bone:'#ede6d2',sulfur:'#d6c63c',rust:'#c0562e',ember:'#9e2b45',mint:'#7fc4a8',dim:'#7c8079' } },
  { id:'ash',    c:{ pit:'#16171a',pitLit:'#1e2024',stone:'#2c3037',stoneLit:'#474d57',bone:'#e8eaef',sulfur:'#cfd6e2',rust:'#8a93a6',ember:'#b8465a',mint:'#69b7c9',dim:'#767c88' } },
  { id:'rust',   c:{ pit:'#1b1310',pitLit:'#241a15',stone:'#36241c',stoneLit:'#57392b',bone:'#f2e3cd',sulfur:'#f0912c',rust:'#b8452a',ember:'#8f2038',mint:'#63b394',dim:'#87766a' } },
  { id:'brine',  c:{ pit:'#0f1720',pitLit:'#152029',stone:'#1e2f3b',stoneLit:'#34505f',bone:'#e2eef2',sulfur:'#5fd9d0',rust:'#3f8fb5',ember:'#c2456e',mint:'#9fe86b',dim:'#6d8290' } },
  { id:'bloom',  c:{ pit:'#171320',pitLit:'#1e192b',stone:'#2b2340',stoneLit:'#463a63',bone:'#efe6f2',sulfur:'#e8c14a',rust:'#a262c9',ember:'#c73f7e',mint:'#63d4a6',dim:'#7f7392' } },
];
let C = { ...SKINS[0].c };
let skinIndex = +(localStorage.getItem('vs_skin') || 0) || 0;
function applySkin(i) {
  skinIndex = ((i % SKINS.length) + SKINS.length) % SKINS.length;
  C = { ...SKINS[skinIndex].c };
  const r = document.documentElement.style;
  const V = { pit:'--pit',pitLit:'--pit-lit',stone:'--stone',stoneLit:'--stone-lit',bone:'--bone',sulfur:'--sulfur',rust:'--rust',ember:'--ember',mint:'--mint',dim:'--dim' };
  for (const k in V) r.setProperty(V[k], C[k]);
  localStorage.setItem('vs_skin', String(skinIndex));
}
applySkin(skinIndex);

// ---------- auth ----------
let mode = 'login';
function setMode(m) { mode = m; $('tabLogin').classList.toggle('active', m==='login'); $('tabRegister').classList.toggle('active', m==='register');
  $('submit').textContent = m==='login'?'LOG IN':'CREATE ACCOUNT';
  $('authhint').textContent = m==='register'?'Username: 3–20 letters, numbers, or underscores. Password: 8+ characters.':''; $('authmsg').textContent=''; }
$('tabLogin').onclick=()=>setMode('login'); $('tabRegister').onclick=()=>setMode('register');
async function submitAuth() { const username=$('u').value.trim(), password=$('pw').value; $('authmsg').textContent=''; $('submit').disabled=true;
  try { const res=await fetch('/api/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({username,password})});
    const data=await res.json().catch(()=>({})); if(!res.ok){$('authmsg').textContent=data.error||'Something went wrong.';return;} startGame(data.username);
  } catch { $('authmsg').textContent='Network error. Try again.'; } finally { $('submit').disabled=false; } }
$('submit').onclick=submitAuth;
$('pw').addEventListener('keydown',e=>{if(e.key==='Enter')submitAuth();});
$('u').addEventListener('keydown',e=>{if(e.key==='Enter')$('pw').focus();});
(async()=>{ try{const r=await fetch('/api/me',{credentials:'same-origin'}); if(r.ok){const d=await r.json();startGame(d.username);}}catch{} })();
$('btnLogout').onclick=async()=>{ try{await fetch('/api/logout',{method:'POST',credentials:'same-origin'});}catch{} location.reload(); };

// ---------- controls (Void Shell binds, arrays, rebindable) ----------
const DEFAULTS = { left:['ArrowLeft'], right:['ArrowRight'], aimUp:['ArrowUp'], aimDown:['ArrowDown'],
  jump:['Space','KeyF'], fire:['KeyD'], nade:['KeyS'], dash:['ShiftLeft','ShiftRight'],
  interact:['KeyA'], aimMode:['KeyM'], chat:['Enter'], settings:['Escape'] };
const LABELS = { left:'Move left',right:'Move right',aimUp:'Aim up',aimDown:'Aim down',jump:'Jump',fire:'Fire',nade:'Grenade',dash:'Dash',interact:'Interact',aimMode:'Toggle mouse aim',chat:'Chat',settings:'Options' };
const ACTIVE = new Set(['left','right','aimUp','aimDown','jump','fire','dash','interact','aimMode','chat','settings']);
const SWALLOW = new Set(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab']);
let binds = loadBinds();
function loadBinds(){ try{ const s=JSON.parse(localStorage.getItem('vs_binds')||'{}'); const o={}; for(const a in DEFAULTS) o[a]=Array.isArray(s[a])?s[a]:DEFAULTS[a].slice(); return o; }catch{ return JSON.parse(JSON.stringify(DEFAULTS)); } }
function saveBinds(){ localStorage.setItem('vs_binds', JSON.stringify(binds)); }
function code2action(){ const m={}; for(const a in binds) for(const k of binds[a]) m[k]=a; return m; }
let CODE2ACTION = code2action();
function prettyKey(code){ if(!code) return '—'; return code.replace(/^Key/,'').replace(/^Digit/,'').replace('ArrowLeft','←').replace('ArrowRight','→').replace('ArrowUp','↑').replace('ArrowDown','↓').replace('ShiftLeft','L-Shift').replace('ShiftRight','R-Shift').replace('Escape','Esc'); }

let listeningFor=null;
function renderBinds(){ const list=$('bindlist'); list.innerHTML='';
  for(const a of Object.keys(DEFAULTS)){ const row=document.createElement('div'); row.className='bindrow';
    const l=document.createElement('span'); l.textContent=LABELS[a];
    if(!ACTIVE.has(a)){ const s=document.createElement('span'); s.className='soon'; s.textContent='  (soon)'; l.appendChild(s); }
    const btn=document.createElement('button'); btn.className='keybtn';
    btn.textContent = listeningFor===a?'press a key…':binds[a].map(prettyKey).join(' / ');
    if(listeningFor===a) btn.classList.add('listening');
    btn.onclick=()=>{ listeningFor=a; renderBinds(); };
    row.appendChild(l); row.appendChild(btn); list.appendChild(row); } }
function renderSkins(){ const w=$('skinlist'); w.innerHTML='';
  SKINS.forEach((s,i)=>{ const d=document.createElement('div'); d.className='skin'+(i===skinIndex?' sel':'');
    const a=document.createElement('span'); a.style.background=s.c.stone; const b=document.createElement('span'); b.style.background=s.c.sulfur;
    d.appendChild(a); d.appendChild(b); d.title=s.id; d.onclick=()=>{ applySkin(i); renderSkins(); }; w.appendChild(d); }); }
function openControls(){ $('controls').classList.remove('hidden'); renderBinds(); renderSkins(); $('toggleMouse').textContent=mouseAim?'ON':'OFF'; $('toggleMouse').classList.toggle('on',mouseAim); }
function closeControls(){ listeningFor=null; $('controls').classList.add('hidden'); }
$('btnControls').onclick=openControls; $('closeControls').onclick=closeControls;
$('resetBinds').onclick=()=>{ binds=JSON.parse(JSON.stringify(DEFAULTS)); saveBinds(); CODE2ACTION=code2action(); renderBinds(); };
$('toggleMouse').onclick=()=>{ mouseAim=!mouseAim; localStorage.setItem('vs_mouse',mouseAim?'1':'0'); $('toggleMouse').textContent=mouseAim?'ON':'OFF'; $('toggleMouse').classList.toggle('on',mouseAim); };

// ---------- networking ----------
let ws=null, connected=false, me=null, hidden=false;
let level=null; const remotes=new Map();
let foes=[], fshots=[], pshots=[], foesAt=0; let waveNo=0;
let self=null, inputSeq=0, pending=[];
function connect(){ const proto=location.protocol==='https:'?'wss':'ws'; ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{connected=true;$('dot').classList.add('on');};
  ws.onclose=(e)=>{connected=false;$('dot').classList.remove('on'); if(e.code===4001){addSys('Signed in from another tab.');return;} if(!hidden)setTimeout(connect,1000);};
  ws.onerror=()=>{try{ws.close();}catch{}};
  ws.onmessage=(ev)=>onMessage(JSON.parse(ev.data)); }
function onMessage(m){ switch(m.type){
  case 'welcome': me=m.user; break;
  case 'room': level=m; remotes.clear(); foes=[]; fshots=[]; pshots=[]; self=Physics.newState(m.spawn); pending=[];
    $('stat').textContent = m.kind==='run'?'':''; $('bossbar').style.display='none'; closeRuns(); break;
  case 'state': onState(m); break;
  case 'wave': waveNo=m.wave; $('wave').textContent = level && level.kind==='run' ? `WAVE ${m.wave}`+(m.boss?` · ${m.boss.toUpperCase()}`:'') : ''; if(m.boss)addSys(m.boss+' approaches.'); break;
  case 'chat': addChat(m.from,m.text,m.color); break;
  case 'system': addSys(m.text); break;
  case 'runList': showRuns(m.runs); break; } }
function onState(m){ const now=performance.now();
  const seen=new Set();
  for(const p of m.players){ if(p.id===(me&&me.id)) continue; seen.add(p.id);
    let r=remotes.get(p.id); if(!r){r={buffer:[],color:p.color,name:p.name};remotes.set(p.id,r);}
    r.color=p.color; r.name=p.name; r.hp=p.hp; r.dead=p.dead; r.iframes=p.iframes; r.aimx=p.aimx; r.aimy=p.aimy;
    r.buffer.push({t:now,x:p.x,y:p.y,face:p.face}); if(r.buffer.length>12)r.buffer.shift(); }
  for(const id of remotes.keys()) if(!seen.has(id)) remotes.delete(id);
  foes=m.foes||[]; fshots=m.fshots||[]; pshots=m.pshots||[]; foesAt=now;
  // boss bar
  const boss=foes.find(f=>f.kind==='boss');
  if(boss){ $('bossbar').style.display='block'; $('bossname').textContent='BROOD MAW'; $('bossfill').style.width=Math.max(0,100*boss.hp/(boss.maxHp||1))+'%'; }
  else $('bossbar').style.display='none';
  // reconcile self
  if(m.you && self && level){
    const y=m.you;
    if(y.dead!==undefined) selfDead=y.dead;
    self.x=y.x; self.y=y.y; self.vx=y.vx; self.vy=y.vy; self.onGround=y.onGround; self.coyote=y.coyote;
    self.jumps=y.jumps; self.face=y.face; self.dropThru=y.dropThru; self.buffer=y.buffer; self.pjump=y.pjump;
    selfHp=y.hp; dashActive=y.dashT>0; dashCd=y.dashCd; myScore=y.score;
    pending=pending.filter(i=>i.seq>y.lastSeq);
    if(!dashActive) for(const i of pending) Physics.step(self,i.input,level);
  }
  updateHud();
}
let selfHp=5, selfDead=false, dashActive=false, dashCd=0, myScore=0;
function updateHud(){ const h=$('hearts'); if(h.children.length!==5){ h.innerHTML=''; for(let i=0;i<5;i++){const d=document.createElement('div');d.className='h';h.appendChild(d);} }
  for(let i=0;i<5;i++) h.children[i].classList.toggle('off', i>=selfHp);
  $('hearts').style.display = (level&&level.kind==='run')?'flex':'none';
  $('stat').textContent = (level&&level.kind==='run')?`SCORE ${myScore}`:''; }

// ---------- input ----------
const held={left:false,right:false,jump:false,aimUp:false,aimDown:false};
let firing=false, mouseAim=localStorage.getItem('vs_mouse')==='1';
const mouse={x:W2(),y:H2()}; let lastAim={x:1,y:0};
function W2(){return 380;} function H2(){return 220;}
function uiBlocking(){ return chatOpen() || !$('controls').classList.contains('hidden') || !$('runs').classList.contains('hidden'); }
function clearHeld(){ held.left=held.right=held.jump=held.aimUp=held.aimDown=false; firing=false; sendInput(); sendFire(false); }
function chatOpen(){ return !$('chatform').classList.contains('hidden'); }
function openChat(){ $('chatform').classList.remove('hidden'); $('chatinput').focus(); clearHeld(); }
function closeChat(){ $('chatform').classList.add('hidden'); $('chatinput').value=''; $('chatinput').blur(); }
$('chatform').addEventListener('submit',e=>{ e.preventDefault(); const t=$('chatinput').value; if(t.trim()&&ws&&connected)ws.send(JSON.stringify({type:'chat',text:t})); closeChat(); });
$('chatinput').addEventListener('keydown',e=>{ if(e.key==='Escape'){e.preventDefault();closeChat();} });

function computeAim(){ // returns normalized aim in game space
  if(mouseAim && self){ const cx=self.x+Physics.PW/2, cy=self.y+Physics.PH/2; let dx=mouse.x-cx, dy=mouse.y-cy; const l=Math.hypot(dx,dy)||1; return {x:dx/l,y:dy/l}; }
  let ax=(held.left?-1:0)+(held.right?1:0); let ay=(held.aimUp?-1:0)+(held.aimDown?1:0);
  if(ax===0&&ay===0){ ax=self?self.face:1; } else if(ay<0&&ax===0){ ax=self?self.face:1; }
  const l=Math.hypot(ax,ay)||1; return {x:ax/l,y:ay/l};
}
// Sampled every tick by a fixed 60Hz loop (see startGame): reads currently-held
// keys, predicts locally, and streams the input to the server. Sending every
// tick (not just on key events) is what keeps gravity/momentum advancing.
function sendInput(){ if(!ws||!connected||!self||!level)return; const b=uiBlocking(); const mask=((!b&&held.left)?1:0)|((!b&&held.right)?2:0)|((!b&&held.jump)?4:0)|((!b&&held.aimDown)?8:0); const input={left:!b&&held.left,right:!b&&held.right,jump:!b&&held.jump,down:!b&&held.aimDown}; ws.send(JSON.stringify({type:'input',seq:++inputSeq,k:mask})); pending.push({seq:inputSeq,input}); if(pending.length>200)pending.shift(); if(!dashActive)Physics.step(self,input,level); }
function sendFire(down){ if(ws&&connected)ws.send(JSON.stringify({type:'fire',down:!!down})); }
function sendAim(){ if(!ws||!connected)return; const a=computeAim(); if(Math.abs(a.x-lastAim.x)>0.02||Math.abs(a.y-lastAim.y)>0.02){ lastAim=a; ws.send(JSON.stringify({type:'aim',x:a.x,y:a.y})); } }

window.addEventListener('keydown',(e)=>{
  if(listeningFor){ e.preventDefault(); if(e.code!=='Escape'){ binds[listeningFor]=[e.code]; saveBinds(); CODE2ACTION=code2action(); } listeningFor=null; renderBinds(); return; }
  if($('game').classList.contains('hidden')) return;
  if(e.target===$('chatinput')) return;
  if(SWALLOW.has(e.code)) e.preventDefault();
  const a=CODE2ACTION[e.code]; if(!a) return; if(e.repeat) return;
  switch(a){
    case 'settings': $('controls').classList.contains('hidden')?openControls():closeControls(); break;
    case 'chat': if(!chatOpen())openChat(); break;
    case 'aimMode': mouseAim=!mouseAim; localStorage.setItem('vs_mouse',mouseAim?'1':'0'); break;
    case 'left': held.left=true; break;
    case 'right': held.right=true; break;
    case 'jump': held.jump=true; break;
    case 'aimUp': held.aimUp=true; break;
    case 'aimDown': held.aimDown=true; break;
    case 'fire': if(!firing){firing=true; sendFire(true);} break;
    case 'dash': if(ws&&connected)ws.send(JSON.stringify({type:'dash'})); break;
    case 'interact': if(ws&&connected)ws.send(JSON.stringify({type:'interact'})); break;
  }
});
window.addEventListener('keyup',(e)=>{ const a=CODE2ACTION[e.code]; if(!a)return;
  if(a==='left'){held.left=false;} else if(a==='right'){held.right=false;}
  else if(a==='jump'){held.jump=false;} else if(a==='aimUp'){held.aimUp=false;}
  else if(a==='aimDown'){held.aimDown=false;} else if(a==='fire'){firing=false;sendFire(false);} });

const canvas=$('c'); const ctx=canvas.getContext('2d');
canvas.addEventListener('mousemove',e=>{ const r=canvas.getBoundingClientRect(); const sx=(e.clientX-r.left-ox)/scale, sy=(e.clientY-r.top-oy)/scale; mouse.x=sx; mouse.y=sy; });
canvas.addEventListener('mousedown',e=>{ if(e.button===0&&!uiBlocking()&&!firing){firing=true;sendFire(true);} });
window.addEventListener('mouseup',()=>{ if(firing){firing=false;sendFire(false);} });
document.addEventListener('visibilitychange',()=>{ if(document.hidden){hidden=true;clearHeld();} else {hidden=false; if(!connected)connect();} });
window.addEventListener('blur',clearHeld);

// ---------- run browser + chat ----------
function showRuns(runs){ const list=$('runlist'); list.innerHTML=''; if(!runs.length){ const e=document.createElement('div'); e.className='empty'; e.textContent='No open runs. Create one and friends can join.'; list.appendChild(e); }
  for(const r of runs){ const row=document.createElement('div'); row.className='runrow'; const meta=document.createElement('div');
    const host=document.createElement('div'); host.textContent=`${r.host}'s run`; const sub=document.createElement('div'); sub.className='meta'; sub.textContent=`${r.count}/${r.cap} · wave ${r.wave}`;
    meta.appendChild(host); meta.appendChild(sub); const btn=document.createElement('button'); btn.className='primary small'; btn.textContent=r.count>=r.cap?'Full':'Join'; btn.disabled=r.count>=r.cap;
    btn.onclick=()=>ws&&ws.send(JSON.stringify({type:'joinRun',id:r.id})); row.appendChild(meta); row.appendChild(btn); list.appendChild(row); }
  $('runs').classList.remove('hidden'); }
function closeRuns(){ $('runs').classList.add('hidden'); }
$('closeRuns').onclick=closeRuns; $('createRun').onclick=()=>ws&&ws.send(JSON.stringify({type:'createRun'})); $('refreshRuns').onclick=()=>ws&&ws.send(JSON.stringify({type:'listRuns'}));
function scrollChat(){ const l=$('chatlog'); l.scrollTop=l.scrollHeight; }
function addChat(from,text,color){ const line=document.createElement('div'); const n=document.createElement('span'); n.className='name'; n.style.color=color||'#fff'; n.textContent=from+': '; const b=document.createElement('span'); b.textContent=text; line.appendChild(n); line.appendChild(b); $('chatlog').appendChild(line); trimChat(); scrollChat(); }
function addSys(text){ const l=document.createElement('div'); l.className='sys'; l.textContent=text; $('chatlog').appendChild(l); trimChat(); scrollChat(); }
function trimChat(){ const l=$('chatlog'); while(l.children.length>50)l.removeChild(l.firstChild); }

// ---------- render (760x440 scaled to fit) ----------
const W=760,H=440,FLOOR_TOP=416,PW=15,PH=21;
let VW=0,VH=0,scale=1,ox=0,oy=0;
function resize(){ VW=canvas.width=innerWidth; VH=canvas.height=innerHeight; scale=Math.min(VW/W,VH/H); ox=(VW-W*scale)/2; oy=(VH-H*scale)/2; }
addEventListener('resize',resize); resize();

function remoteAt(r,t){ const b=r.buffer; if(!b.length)return null; if(b.length===1)return b[0];
  for(let i=0;i<b.length-1;i++){ if(b[i].t<=t&&t<=b[i+1].t){ const a=b[i],c=b[i+1],f=(t-a.t)/Math.max(1,c.t-a.t); return {x:a.x+(c.x-a.x)*f,y:a.y+(c.y-a.y)*f,face:c.face}; } } return b[b.length-1]; }

function drawPlayer(x,y,face,color,dead,iframes,aimx,aimy){
  if(dead){ ctx.globalAlpha=0.35; }
  if(iframes>0 && Math.floor(performance.now()/60)%2===0) ctx.globalAlpha=0.4;
  ctx.fillStyle=color; ctx.fillRect(x+2,y+4,PW-4,PH-6);
  ctx.fillStyle=C.bone; ctx.fillRect(x+3,y+2,PW-6,6);           // head
  ctx.fillStyle=C.pit; ctx.fillRect(x+(face>=0?PW-6:2),y+4,3,3); // eye
  // core dot (the actual hurtbox — Void Shell's signature)
  ctx.fillStyle=C.sulfur; ctx.fillRect(x+PW/2-1.5,y+PH/2-1.5,3,3);
  // gun
  const ca=Math.atan2(aimy,aimx); ctx.strokeStyle=C.bone; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x+PW/2,y+PH/2); ctx.lineTo(x+PW/2+Math.cos(ca)*11,y+PH/2+Math.sin(ca)*11); ctx.stroke();
  ctx.globalAlpha=1;
}
function drawFoe(f){
  const cx=f.x+f.w/2, cy=f.y+f.h/2; const flash=f.hit>0;
  if(f.kind==='boss'){
    ctx.fillStyle=flash?C.bone:C.ember; ctx.beginPath();
    ctx.ellipse(cx,cy,f.w/2,f.h/2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=C.pit; ctx.beginPath(); ctx.ellipse(cx,cy+6,f.w/2-10,f.h/3,0,0,Math.PI); ctx.fill(); // maw
    ctx.fillStyle=C.sulfur; for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.arc(cx+i*16,cy-8,3,0,Math.PI*2); ctx.fill(); }
    return;
  }
  if(f.kind==='drifter'){ ctx.fillStyle=flash?C.bone:C.rust; ctx.beginPath(); ctx.moveTo(cx,f.y); ctx.lineTo(f.x+f.w,cy); ctx.lineTo(cx,f.y+f.h); ctx.lineTo(f.x,cy); ctx.closePath(); ctx.fill(); }
  else if(f.kind==='spitter'){ ctx.fillStyle=flash?C.bone:C.rust; ctx.fillRect(f.x,f.y,f.w,f.h); ctx.fillStyle=C.sulfur; ctx.fillRect(cx-2,cy-2,4,4); }
  else if(f.kind==='diver'){ ctx.fillStyle=flash?C.bone:C.ember; ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.atan2(f.vy||0,f.vx||1)); ctx.beginPath(); ctx.moveTo(f.w/2,0); ctx.lineTo(-f.w/2,-f.h/2); ctx.lineTo(-f.w/2,f.h/2); ctx.closePath(); ctx.fill(); ctx.restore(); }
  else { ctx.fillStyle=C.rust; ctx.fillRect(f.x,f.y,f.w,f.h); }
}

function draw(){
  ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=C.pit; ctx.fillRect(0,0,VW,VH);
  if(!level||!me||!self){ requestAnimationFrame(draw); return; }
  const now=performance.now();
  ctx.setTransform(scale,0,0,scale,ox,oy);
  // arena frame + backdrop
  ctx.fillStyle=C.pitLit; ctx.fillRect(0,0,W,H);
  // platforms
  for(const p of level.platforms){ ctx.fillStyle=p.solid?C.stone:C.stoneLit; ctx.fillRect(p.x,p.y,p.w,p.h); if(!p.solid){ctx.fillStyle=C.stone;ctx.fillRect(p.x,p.y+3,p.w,p.h-3);} }
  // doors
  for(const d of (level.doors||[])){ ctx.fillStyle='rgba(214,198,60,0.18)'; ctx.fillRect(d.x,d.y,d.w,d.h); ctx.strokeStyle=C.sulfur; ctx.lineWidth=2; ctx.strokeRect(d.x,d.y,d.w,d.h);
    ctx.fillStyle=C.sulfur; ctx.font='11px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(d.label,d.x+d.w/2,d.y-6); }
  let promptDoor=null; for(const d of (level.doors||[])) if(self.x<d.x+d.w&&self.x+PW>d.x&&self.y<d.y+d.h&&self.y+PH>d.y) promptDoor=d;

  // player bullets
  for(const b of pshots){ ctx.fillStyle=b.color||C.sulfur; ctx.beginPath(); ctx.arc(b.x,b.y,2.4,0,Math.PI*2); ctx.fill(); }
  // foes
  for(const f of foes) drawFoe(f);
  // foe shots (bullet-hell) with slight extrapolation
  const dt=(now-foesAt)/1000;
  for(const b of fshots){ ctx.fillStyle=C.rust; ctx.beginPath(); ctx.arc(b.x,b.y,b.r||3,0,Math.PI*2); ctx.fill(); ctx.fillStyle='rgba(214,198,60,0.5)'; ctx.beginPath(); ctx.arc(b.x,b.y,(b.r||3)*0.5,0,Math.PI*2); ctx.fill(); }
  // remotes
  const rt=now-100;
  for(const [,r] of remotes){ const s=remoteAt(r,rt); if(!s)continue; drawPlayer(s.x,s.y,s.face,r.color,r.dead,r.iframes,s.face,0); ctx.fillStyle=C.bone; ctx.font='10px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(r.name||'',s.x+PW/2,s.y-6); }
  // self
  const a=computeAim(); drawPlayer(self.x,self.y,self.face,remotes.get(me.id)?.color||C.mint,selfDead,0,a.x,a.y);

  // prompt + reticle (screen space)
  ctx.setTransform(1,0,0,1,0,0);
  if(promptDoor&&!uiBlocking()){ $('prompt').classList.remove('hidden'); const verb=promptDoor.type==='leave'?'exit':'open runs'; $('prompt').innerHTML=`Press <kbd>${prettyKey(binds.interact[0])}</kbd> to ${verb}`; }
  else $('prompt').classList.add('hidden');
  if(mouseAim && !uiBlocking()){ const mx=ox+mouse.x*scale, my=oy+mouse.y*scale; ctx.strokeStyle=C.bone; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(mx,my,6,0,Math.PI*2); ctx.stroke(); }

  sendAim();
  requestAnimationFrame(draw);
}

function startGame(username){ $('auth').classList.add('hidden'); $('game').classList.remove('hidden'); connect(); setInterval(sendInput, 1000/60); draw(); }
