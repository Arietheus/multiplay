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
let foeBuf=new Map(), fshots=[], pshots=[], foesAt=0; let waveNo=0;
let self=null, inputSeq=0, pending=[];
function connect(){ const proto=location.protocol==='https:'?'wss':'ws'; ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{connected=true;$('dot').classList.add('on');};
  ws.onclose=(e)=>{connected=false;$('dot').classList.remove('on'); if(e.code===4001){addSys('Signed in from another tab.');return;} if(!hidden)setTimeout(connect,1000);};
  ws.onerror=()=>{try{ws.close();}catch{}};
  ws.onmessage=(ev)=>onMessage(JSON.parse(ev.data)); }
function onMessage(m){ switch(m.type){
  case 'welcome': me=m.user; break;
  case 'room': level=m; remotes.clear(); foeBuf.clear(); fshots=[]; pshots=[]; self=Physics.newState(m.spawn); pending=[]; myShots=[]; bits=[]; shakeAmt=0;
    $('stat').textContent = m.kind==='run'?'':''; $('bossbar').style.display='none'; closeRuns(); break;
  case 'state': onState(m); break;
  case 'wave': waveNo=m.wave; $('wave').textContent = level && level.kind==='run' ? `WAVE ${m.wave}`+(m.boss?` · ${m.boss.toUpperCase()}`:'') : ''; if(m.boss)addSys(m.boss+' approaches.'); break;
  case 'chat': addChat(m.from,m.text,m.color); break;
  case 'system': addSys(m.text); break;
  case 'runList': showRuns(m.runs); break; } }
function onState(m){ const now=performance.now();
  const seen=new Set();
  for(const p of m.players){ if(p.id===(me&&me.id)){ myColor=p.color; continue; } seen.add(p.id);
    let r=remotes.get(p.id); if(!r){r={buffer:[],color:p.color,name:p.name};remotes.set(p.id,r);}
    r.color=p.color; r.name=p.name; r.hp=p.hp; r.dead=p.dead; r.iframes=p.iframes; r.aimx=p.aimx; r.aimy=p.aimy;
    r.buffer.push({t:now,x:p.x,y:p.y,face:p.face}); if(r.buffer.length>12)r.buffer.shift(); }
  for(const id of remotes.keys()) if(!seen.has(id)) remotes.delete(id);
  // foes -> per-id interpolation buffers (smooth motion between 30Hz snapshots)
  const fseen=new Set();
  for(const f of (m.foes||[])){ fseen.add(f.id);
    let e=foeBuf.get(f.id); if(!e){ e={buf:[]}; foeBuf.set(f.id,e); }
    e.kind=f.kind; e.boss=f.boss; e.w=f.w; e.h=f.h; e.hp=f.hp; e.maxHp=f.maxHp; e.hit=f.hit;
    e.ph=f.ph; e.ch=f.ch; e.vx=f.vx; e.vy=f.vy; e.serverT=f.t; e.atMs=now;
    e.buf.push({t:now,x:f.x,y:f.y}); if(e.buf.length>12)e.buf.shift(); }
  for(const id of foeBuf.keys()) if(!fseen.has(id)){ const e=foeBuf.get(id); const last=e.buf[e.buf.length-1];
    if(last){ if(e.boss){ shake(12); burst(last.x+e.w/2,last.y+e.h/2,30,C.ember,4.2,38); } else burst(last.x+(e.w||8)/2,last.y+(e.h||8)/2,10,C.bone,3,22); }
    foeBuf.delete(id); }
  fshots=m.fshots||[]; pshots=m.pshots||[]; foesAt=now;
  const boss=(m.foes||[]).find(f=>f.kind==='boss');
  if(boss){ $('bossbar').style.display='block'; $('bossname').textContent='BROOD MAW'; $('bossfill').style.width=Math.max(0,100*boss.hp/(boss.maxHp||1))+'%'; }
  else $('bossbar').style.display='none';
  // reconcile self
  if(m.you && self && level){
    const y=m.you;
    if(y.dead!==undefined) selfDead=y.dead;
    if(y.hp<selfHp){ shake(9); burst(self.x+PW/2,self.y+PH/2,14,C.ember,3.4,30); }
    self.x=y.x; self.y=y.y; self.vx=y.vx; self.vy=y.vy; self.onGround=y.onGround; self.coyote=y.coyote;
    self.jumps=y.jumps; self.face=y.face; self.dropThru=y.dropThru; self.buffer=y.buffer; self.pjump=y.pjump;
    self.dashT=y.dashT; self.dashCd=y.dashCd; if(y.dashX!==undefined){ self.dashX=y.dashX; self.dashY=y.dashY; }
    selfHp=y.hp; dashCd=y.dashCd; myScore=y.score;
    pending=pending.filter(i=>i.seq>y.lastSeq);
    for(const i of pending) Physics.step(self,i.input,level);
  }
  updateHud();
}
let selfHp=5, selfDead=false, dashCd=0, myScore=0;
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
// --- screen shake, ported from Void Shell (state.shake, decay *0.86) ---
let shakeAmt=0;
function shake(a){ shakeAmt=Math.min(16, shakeAmt+a); }
// --- particle bits, ported from Void Shell's burst()/stepBits()/drawBits() ---
let bits=[];
function burst(x,y,count,color,speed=3,life=26){
  for(let i=0;i<count;i++){ const a=Math.random()*Math.PI*2, s=speed*(0.35+Math.random()*0.9);
    bits.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:life*(0.6+Math.random()*0.7),max:life,color,size:1+Math.random()*2,grav:0.14}); }
}
function stepBits(){ for(let i=bits.length-1;i>=0;i--){ const b=bits[i]; b.x+=b.vx; b.y+=b.vy; b.vy+=b.grav; b.vx*=0.96; b.life--; if(b.life<=0)bits.splice(i,1); } }
function drawBits(){ for(const b of bits){ ctx.globalAlpha=Math.max(0,b.life/b.max); ctx.fillStyle=b.color; ctx.fillRect(b.x,b.y,b.size,b.size); } ctx.globalAlpha=1; }

// --- client-predicted own shots (server stays authoritative for damage) ---
let myShots=[], myFireCd=0, dashQueued=false, dashAim={x:1,y:0}, myColor=null;
function shotHitsSolid(s){ for(const p of level.platforms) if(p.solid && s.x>p.x&&s.x<p.x+p.w&&s.y>p.y&&s.y<p.y+p.h) return true; return false; }
function predictFire(blocked){
  if(myFireCd>0)myFireCd--;
  if(!blocked && firing && !selfDead && level && level.kind==='run' && myFireCd<=0){
    const a=computeAim(); myShots.push({x:self.x+PW/2+a.x*7,y:self.y+PH/2+a.y*7,vx:a.x*8.4,vy:a.y*8.4,life:64}); myFireCd=7;
  }
  for(const s of myShots){ s.x+=s.vx; s.y+=s.vy; s.life--; }
  myShots=myShots.filter(s=> s.life>0 && s.x>-10&&s.x<W+10&&s.y>-10&&s.y<H+10 && !shotHitsSolid(s));
}

// Sampled every tick by a fixed 60Hz loop (see startGame): reads currently-held
// keys, predicts locally (movement + dash + own shots), and streams input.
function sendInput(){ if(!ws||!connected||!self||!level)return; const b=uiBlocking();
  const mask=((!b&&held.left)?1:0)|((!b&&held.right)?2:0)|((!b&&held.jump)?4:0)|((!b&&held.aimDown)?8:0);
  const input={left:!b&&held.left,right:!b&&held.right,jump:!b&&held.jump,down:!b&&held.aimDown};
  const msg={type:'input',seq:++inputSeq,k:mask};
  if(dashQueued && !b){ input.dash=true; input.ax=dashAim.x; input.ay=dashAim.y; msg.dash=1; msg.ax=+dashAim.x.toFixed(3); msg.ay=+dashAim.y.toFixed(3); }
  dashQueued=false;
  ws.send(JSON.stringify(msg));
  pending.push({seq:inputSeq,input}); if(pending.length>200)pending.shift();
  Physics.step(self,input,level);
  if(input.dash){ burst(self.x+PW/2,self.y+PH/2,8,C.bone,2,16); }
  predictFire(b); stepBits();
}
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
    case 'chat': if(!chatOpen()){ e.preventDefault(); openChat(); } break;
    case 'aimMode': mouseAim=!mouseAim; localStorage.setItem('vs_mouse',mouseAim?'1':'0'); break;
    case 'left': held.left=true; break;
    case 'right': held.right=true; break;
    case 'jump': held.jump=true; break;
    case 'aimUp': held.aimUp=true; break;
    case 'aimDown': held.aimDown=true; break;
    case 'fire': if(!firing){firing=true; sendFire(true);} break;
    case 'dash': dashQueued=true; dashAim=computeAim(); break;
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
// enemy colours read from the live palette so skins repaint them
const FOE_KEY={drifter:'rust',spitter:'rust',diver:'ember',splitter:'rust',spawnling:'rust',lancer:'ember',warden:'rust',seeder:'rust',howler:'ember'};
const centerOf=(f)=>({x:f.x+f.w/2,y:f.y+f.h/2});

// --- enemy sprites, ported from Void Shell's drawFoes() ---
function drawFoeVS(f){
  if(f.kind==='boss') return drawMawVS(f);
  const c=centerOf(f); const k={color:C[FOE_KEY[f.kind]]||C.rust}; const lit=f.hit>0;

  if(f.kind==='drifter'){
    const flap=Math.sin(f.t*0.34)*5;
    ctx.strokeStyle=lit?C.bone:k.color; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(c.x-3,c.y); ctx.lineTo(c.x-11,c.y-flap); ctx.moveTo(c.x+3,c.y); ctx.lineTo(c.x+11,c.y-flap); ctx.stroke();
    ctx.fillStyle=lit?C.bone:C.stoneLit; ctx.beginPath(); ctx.ellipse(c.x,c.y,7,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=lit?C.bone:k.color; ctx.beginPath(); ctx.arc(c.x,c.y,2.4,0,Math.PI*2); ctx.fill();
  }
  if(f.kind==='spitter'){
    const swell=f.charge>0?1+(28-f.charge)/40:1;
    ctx.fillStyle=lit?C.bone:C.stoneLit; ctx.beginPath(); ctx.ellipse(c.x,c.y,9.5*swell,8*swell,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=lit?C.bone:k.color; ctx.globalAlpha=f.charge>0?1:0.75; ctx.beginPath(); ctx.arc(c.x,c.y,3.4*swell,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=lit?C.bone:k.color; ctx.lineWidth=1.5;
    for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(c.x+i*4,c.y+6); ctx.lineTo(c.x+i*6,c.y+12+Math.sin(f.t*0.14+i)*2); ctx.stroke(); }
  }
  if(f.kind==='splitter'){
    const squirm=Math.sin(f.t*0.06)*0.05;
    ctx.fillStyle=lit?C.bone:C.stoneLit; ctx.beginPath(); ctx.ellipse(c.x,c.y,10.5*(1+squirm),9.5*(1-squirm),0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=lit?C.bone:k.color; ctx.globalAlpha=0.85;
    for(let i=0;i<3;i++){ const a=(i/3)*Math.PI*2+f.t*0.05; ctx.beginPath(); ctx.arc(c.x+Math.cos(a)*4.2,c.y+Math.sin(a)*3.6,2.1,0,Math.PI*2); ctx.fill(); }
    ctx.globalAlpha=1; ctx.strokeStyle=lit?C.bone:k.color; ctx.lineWidth=1.4; ctx.beginPath(); ctx.ellipse(c.x,c.y,10.5,9.5,0,0,Math.PI*2); ctx.stroke();
  }
  if(f.kind==='spawnling'){
    const ang=Math.atan2(f.vy,f.vx); ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(ang);
    ctx.fillStyle=lit?C.bone:k.color; ctx.beginPath(); ctx.moveTo(5,0); ctx.lineTo(-4,-3.2); ctx.lineTo(-4,3.2); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  if(f.kind==='lancer'){
    if(f.charge>0){ ctx.strokeStyle=C.ember; ctx.globalAlpha=0.28+(34-f.charge)/60; ctx.lineWidth=1.4; ctx.setLineDash([5,5]);
      ctx.beginPath(); ctx.moveTo(c.x,c.y); ctx.lineTo(c.x+(f.aimX||1)*460,c.y+(f.aimY||0)*460); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1; }
    const face=f.aimX!==undefined&&f.charge>0?Math.atan2(f.aimY,f.aimX):(f.vx<0?Math.PI:0);
    ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(face);
    ctx.fillStyle=lit?C.bone:C.stoneLit; ctx.beginPath(); ctx.moveTo(13,0); ctx.lineTo(-2,-6); ctx.lineTo(-10,-3); ctx.lineTo(-10,3); ctx.lineTo(-2,6); ctx.closePath(); ctx.fill();
    ctx.fillStyle=f.charge>0&&Math.floor(f.charge/3)%2===0?C.bone:k.color; ctx.beginPath(); ctx.arc(4,0,2.6,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  if(f.kind==='warden'){
    const ga=Math.atan2(f.guardY||0,f.guardX||1);
    ctx.fillStyle=lit?C.bone:C.stoneLit; ctx.beginPath(); ctx.ellipse(c.x,c.y,10,9.5,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=lit?C.bone:k.color; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(c.x,c.y,15,ga-0.85,ga+0.85); ctx.stroke();
    ctx.fillStyle=C.ember; ctx.beginPath(); ctx.arc(c.x-Math.cos(ga)*4,c.y-Math.sin(ga)*4,2.4,0,Math.PI*2); ctx.fill();
  }
  if(f.kind==='seeder'){
    ctx.fillStyle=lit?C.bone:C.stoneLit; ctx.beginPath(); ctx.ellipse(c.x,c.y-2,10,8.5,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=lit?C.bone:C.ember; ctx.lineWidth=2;
    for(let i=-1;i<=1;i++){ const sway=Math.sin(f.t*0.08+i)*2.5; ctx.beginPath(); ctx.moveTo(c.x+i*5,c.y+5); ctx.lineTo(c.x+i*5+sway,c.y+13); ctx.stroke(); }
    const swell=1+Math.sin(f.t*0.065)*0.25; ctx.fillStyle=C.ember; ctx.beginPath(); ctx.arc(c.x,c.y+14,3*swell,0,Math.PI*2); ctx.fill();
  }
  if(f.kind==='howler'){
    const pulse=1+Math.sin(f.t*0.16)*0.14; ctx.strokeStyle=lit?C.bone:k.color; ctx.lineWidth=2;
    for(let i=0;i<8;i++){ const a=(i/8)*Math.PI*2+f.t*0.03; ctx.beginPath(); ctx.moveTo(c.x+Math.cos(a)*6,c.y+Math.sin(a)*6); ctx.lineTo(c.x+Math.cos(a)*12*pulse,c.y+Math.sin(a)*12*pulse); ctx.stroke(); }
    ctx.fillStyle=lit?C.bone:C.stoneLit; ctx.beginPath(); ctx.arc(c.x,c.y,6.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=k.color; ctx.beginPath(); ctx.arc(c.x,c.y,3*pulse,0,Math.PI*2); ctx.fill();
  }
  if(f.kind==='diver'){
    const tell=f.phase==='tell'&&Math.floor(f.charge/3)%2===0;
    const ang=f.phase==='dive'?Math.atan2(f.vy,f.vx):0;
    ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(ang);
    ctx.fillStyle=tell||lit?C.bone:C.stoneLit; ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-7,-6); ctx.lineTo(-4,0); ctx.lineTo(-7,6); ctx.closePath(); ctx.fill();
    ctx.fillStyle=tell?C.bone:k.color; ctx.beginPath(); ctx.arc(3,0,2.2,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
}

// --- the brood maw, ported from Void Shell's drawMaw() ---
function drawMawVS(f){
  const c=centerOf(f); const lit=f.hit>0;
  const winding=f.charge>0&&f.phase!=='entry'&&f.phase!=='hover';
  const tell=winding&&Math.floor(f.charge/3)%2===0;
  const pulse=1+Math.sin(f.t*0.06)*0.035; const flap=Math.sin(f.t*0.07)*11;
  ctx.strokeStyle=lit?C.bone:C.stoneLit; ctx.lineWidth=4; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(c.x-f.w*0.3,c.y); ctx.lineTo(c.x-f.w*0.72,c.y-14-flap);
  ctx.moveTo(c.x-f.w*0.3,c.y+4); ctx.lineTo(c.x-f.w*0.6,c.y+16+flap*0.4);
  ctx.moveTo(c.x+f.w*0.3,c.y); ctx.lineTo(c.x+f.w*0.72,c.y-14-flap);
  ctx.moveTo(c.x+f.w*0.3,c.y+4); ctx.lineTo(c.x+f.w*0.6,c.y+16+flap*0.4);
  ctx.stroke();
  ctx.fillStyle=lit?C.bone:C.stone; ctx.beginPath(); ctx.ellipse(c.x,c.y,(f.w/2)*pulse,(f.h/2)*pulse,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=tell?C.ember:C.stoneLit; ctx.lineWidth=2; ctx.stroke();
  const pods=7;
  for(let i=0;i<pods;i++){ const a=(i/pods)*Math.PI*2+f.t*0.012; const px=c.x+Math.cos(a)*f.w*0.3; const py=c.y+Math.sin(a)*f.h*0.31;
    ctx.fillStyle=f.phase==='brood'?C.rust:C.ember; ctx.globalAlpha=0.5+Math.sin(f.t*0.1+i)*0.4; ctx.beginPath(); ctx.arc(px,py,3.1,0,Math.PI*2); ctx.fill(); }
  ctx.globalAlpha=1;
  const swell=winding?(34-f.charge)/5:0;
  ctx.fillStyle=tell?C.ember:C.sulfur; ctx.beginPath(); ctx.arc(c.x,c.y,7+swell,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=C.pit; ctx.beginPath(); ctx.arc(c.x,c.y,2.6,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=lit?C.bone:C.stoneLit; ctx.lineWidth=3; const gape=f.phase==='slam'?7:3;
  ctx.beginPath(); ctx.moveTo(c.x-12,c.y+f.h*0.4); ctx.lineTo(c.x-6-gape,c.y+f.h*0.62); ctx.moveTo(c.x+12,c.y+f.h*0.4); ctx.lineTo(c.x+6+gape,c.y+f.h*0.62); ctx.stroke();
}

// --- projectiles, ported from Void Shell's drawFoeShots() ---
function drawFoeShotVS(x,y,r,color){
  const rr=(r||2.6)+0.9;
  ctx.fillStyle=C.pit; ctx.globalAlpha=0.92; ctx.beginPath(); ctx.arc(x,y,rr+2.3,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
  ctx.fillStyle=color||C.rust; ctx.beginPath(); ctx.arc(x,y,rr,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=C.bone; ctx.beginPath(); ctx.arc(x,y,Math.max(1.1,rr*0.42),0,Math.PI*2); ctx.fill();
}
function drawBolt(x,y,vx,vy,color){
  const l=Math.hypot(vx||0,vy||1)||1, ux=(vx||0)/l, uy=(vy||1)/l;
  ctx.strokeStyle=color||C.sulfur; ctx.lineWidth=2.4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x-ux*5,y-uy*5); ctx.lineTo(x+ux*3,y+uy*3); ctx.stroke();
  ctx.fillStyle=C.bone; ctx.beginPath(); ctx.arc(x+ux*3,y+uy*3,1.6,0,Math.PI*2); ctx.fill();
}

function draw(){
  ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=C.pit; ctx.fillRect(0,0,VW,VH);
  if(!level||!me||!self){ requestAnimationFrame(draw); return; }
  const now=performance.now();
  let shx=0,shy=0; if(shakeAmt>0.4){ shx=(Math.random()*2-1)*shakeAmt*scale; shy=(Math.random()*2-1)*shakeAmt*scale; shakeAmt*=0.86; }
  ctx.setTransform(scale,0,0,scale,ox+shx,oy+shy);
  // arena frame + backdrop
  ctx.fillStyle=C.pitLit; ctx.fillRect(0,0,W,H);
  // platforms
  for(const p of level.platforms){ ctx.fillStyle=p.solid?C.stone:C.stoneLit; ctx.fillRect(p.x,p.y,p.w,p.h); if(!p.solid){ctx.fillStyle=C.stone;ctx.fillRect(p.x,p.y+3,p.w,p.h-3);} }
  // doors
  for(const d of (level.doors||[])){ ctx.fillStyle='rgba(214,198,60,0.18)'; ctx.fillRect(d.x,d.y,d.w,d.h); ctx.strokeStyle=C.sulfur; ctx.lineWidth=2; ctx.strokeRect(d.x,d.y,d.w,d.h);
    ctx.fillStyle=C.sulfur; ctx.font='11px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(d.label,d.x+d.w/2,d.y-6); }
  let promptDoor=null; for(const d of (level.doors||[])) if(self.x<d.x+d.w&&self.x+PW>d.x&&self.y<d.y+d.h&&self.y+PH>d.y) promptDoor=d;

  const TICK=1000/60;
  const sclamp=Math.min(Math.max((now-foesAt)/TICK,0),4);
  // foes — extrapolated forward from the last 30Hz snapshot for smooth 60fps motion
  for(const [,e] of foeBuf){ const last=e.buf[e.buf.length-1]; if(!last)continue;
    const et=Math.min(Math.max((now-e.atMs)/TICK,0),3);
    const ef={kind:e.kind,boss:e.boss,w:e.w,h:e.h,hit:e.hit,phase:e.ph,charge:e.ch,vx:e.vx,vy:e.vy,
      x:last.x+(e.vx||0)*et, y:last.y+(e.vy||0)*et, t:(e.serverT||0)+et};
    drawFoeVS(ef); }
  // foe shots — extrapolated (with gravity for lobs), Void Shell bullet look
  for(const b of fshots){ const bx=b.x+(b.vx||0)*sclamp, by=b.y+(b.vy||0)*sclamp+(b.g?0.5*b.g*sclamp*sclamp:0); drawFoeShotVS(bx,by,b.r,b.color); }
  // player bullets — others' from the server (extrapolated); own are predicted below
  for(const b of pshots){ if(b.owner===(me&&me.id))continue; const bx=b.x+(b.vx||0)*sclamp, by=b.y+(b.vy||0)*sclamp; drawBolt(bx,by,b.vx,b.vy,b.color); }
  // own predicted shots (instant feedback; server authoritative for hits)
  const col=myColor||C.mint;
  for(const s of myShots){ drawBolt(s.x,s.y,s.vx,s.vy,col); }
  // particle bits
  drawBits();
  // remotes
  const rt=now-100;
  for(const [,r] of remotes){ const s=remoteAt(r,rt); if(!s)continue; drawPlayer(s.x,s.y,s.face,r.color,r.dead,r.iframes,s.face,0); ctx.fillStyle=C.bone; ctx.font='10px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(r.name||'',s.x+PW/2,s.y-6); }
  // self
  const a=computeAim(); drawPlayer(self.x,self.y,self.face,myColor||C.mint,selfDead,0,a.x,a.y);

  // prompt + reticle (screen space)
  ctx.setTransform(1,0,0,1,0,0);
  if(promptDoor&&!uiBlocking()){ $('prompt').classList.remove('hidden'); const verb=promptDoor.type==='leave'?'exit':'open runs'; $('prompt').innerHTML=`Press <kbd>${prettyKey(binds.interact[0])}</kbd> to ${verb}`; }
  else $('prompt').classList.add('hidden');
  if(mouseAim && !uiBlocking()){ const mx=ox+mouse.x*scale, my=oy+mouse.y*scale; ctx.strokeStyle=C.bone; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(mx,my,6,0,Math.PI*2); ctx.stroke(); }

  sendAim();
  requestAnimationFrame(draw);
}

function startGame(username){ $('auth').classList.add('hidden'); $('game').classList.remove('hidden'); connect(); setInterval(sendInput, 1000/60); draw(); }
