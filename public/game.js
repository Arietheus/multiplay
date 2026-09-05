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
const ACTIVE = new Set(['left','right','aimUp','aimDown','jump','fire','nade','dash','interact','aimMode','chat','settings']);
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
let foeBuf=new Map(), fshots=[], pshots=[], quakes=[], nades=[], foesAt=0; let waveNo=0;
let blasts=[], catalog=[], owned=new Set(), myCrest=null, myWake=null;
// wake particle specs, ported from Void Shell's WAKE_LOOK
const WAKE_LOOK={
  embers:{color:()=>C.sulfur,n:5,speed:2.4,life:26,grav:0.06,size:2},
  frost :{color:()=>C.mint,  n:4,speed:0.7,life:42,grav:-0.01,size:2},
  soot  :{color:()=>C.stone, n:6,speed:1.4,life:34,grav:0.16,size:3},
  rune  :{color:()=>C.rust,  n:3,speed:0.3,life:30,grav:0,size:3.4},
  comet :{color:()=>(Math.random()<0.4?C.bone:C.sulfur),n:7,speed:1.1,life:52,grav:-0.02,size:2.6},
};
const BOSS_NAMES={maw:'BROOD MAW',anvil:'THE ANVIL',vesper:'VESPER',chorus:'THE CHORUS',bore:'THE BORE'};
let self=null, inputSeq=0, pending=[];
function connect(){ const proto=location.protocol==='https:'?'wss':'ws'; ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{connected=true;$('dot').classList.add('on');};
  ws.onclose=(e)=>{connected=false;$('dot').classList.remove('on'); if(e.code===4001){addSys('Signed in from another tab.');return;} if(!hidden)setTimeout(connect,1000);};
  ws.onerror=()=>{try{ws.close();}catch{}};
  ws.onmessage=(ev)=>onMessage(JSON.parse(ev.data)); }
function onMessage(m){ switch(m.type){
  case 'welcome': me=m.user; break;
  case 'progress': mySlag=m.slag; myBest=m.bestWave; if(m.cosmetics)owned=new Set(m.cosmetics); if('crest' in m)myCrest=m.crest; if('wake' in m)myWake=m.wake; renderShop(); updateHud(); break;
  case 'catalog': catalog=m.cosmetics||[]; renderShop(); break;
  case 'openShop': openShop(); break;
  case 'blast': blasts.push({x:m.x,y:m.y,r:m.r,t:0}); shake(7); burst(m.x,m.y,22,C.sulfur,4.2,30); break;
  case 'room': level=m; youHost=!!m.youHost; remotes.clear(); foeBuf.clear(); fshots=[]; pshots=[]; self=Physics.newState(m.spawn); pending=[]; myShots=[]; bits=[]; shakeAmt=0;
    selfDead=false; $('death').classList.add('hidden');
    $('btnEnd').classList.toggle('hidden', !(m.kind==='run' && youHost));
    $('bossbar').style.display='none'; closeRuns(); updateHud(); break;
  case 'state': onState(m); break;
  case 'wave': waveNo=m.wave; $('wave').textContent = level && level.kind==='run' ? `WAVE ${m.wave}`+(level.diffName?` · ${level.diffName.toUpperCase()}`:'')+(m.boss?` · ${m.boss.toUpperCase()}`:'') : ''; if(m.boss)addSys(m.boss+' approaches.'); break;
  case 'runEnd': showPostmortem(m); break;
  case 'fx': shake(m.shake||0); break;
  case 'chat': addChat(m.from,m.text,m.color); break;
  case 'system': addSys(m.text); break;
  case 'runList': showRuns(m.runs); break; } }
function onState(m){ const now=performance.now();
  const seen=new Set();
  for(const p of m.players){ if(p.id===(me&&me.id)){ myColor=p.color; continue; } seen.add(p.id);
    let r=remotes.get(p.id); if(!r){r={buffer:[],color:p.color,name:p.name};remotes.set(p.id,r);}
    r.color=p.color; r.name=p.name; r.hp=p.hp; r.dead=p.dead; r.iframes=p.iframes; r.aimx=p.aimx; r.aimy=p.aimy; r.crest=p.crest; r.wake=p.wake;
    r.buffer.push({t:now,x:p.x,y:p.y,face:p.face}); if(r.buffer.length>12)r.buffer.shift(); }
  for(const id of remotes.keys()) if(!seen.has(id)) remotes.delete(id);
  // foes -> per-id interpolation buffers (smooth motion between 30Hz snapshots)
  const fseen=new Set();
  for(const f of (m.foes||[])){ fseen.add(f.id);
    let e=foeBuf.get(f.id); if(!e){ e={buf:[]}; foeBuf.set(f.id,e); }
    e.kind=f.kind; e.boss=f.boss; e.w=f.w; e.h=f.h; e.hp=f.hp; e.maxHp=f.maxHp; e.hit=f.hit;
    e.ph=f.ph; e.ch=f.ch; e.vx=f.vx; e.vy=f.vy; e.serverT=f.t; e.atMs=now;
    if(f.kind==='boss') Object.assign(e,{role:f.role,guard:f.guard,airborne:f.airborne,armored:f.armored,blade:f.blade,twin:f.twin,blinkT:f.blinkT,bx:f.bx,by:f.by,ax:f.ax,ay:f.ay,gx:f.gx,gy:f.gy,fx:f.fx,fy:f.fy,tr:f.tr});
    e.buf.push({t:now,x:f.x,y:f.y}); if(e.buf.length>12)e.buf.shift(); }
  for(const id of foeBuf.keys()) if(!fseen.has(id)){ const e=foeBuf.get(id); const last=e.buf[e.buf.length-1];
    if(last){ if(e.boss){ shake(12); burst(last.x+e.w/2,last.y+e.h/2,30,C.ember,4.2,38); } else burst(last.x+(e.w||8)/2,last.y+(e.h||8)/2,10,C.bone,3,22); }
    foeBuf.delete(id); }
  fshots=m.fshots||[]; pshots=m.pshots||[]; quakes=m.quakes||[]; nades=m.nades||[]; foesAt=now;
  const bosses=(m.foes||[]).filter(f=>f.kind==='boss');
  if(bosses.length){ $('bossbar').style.display='block'; $('bossname').textContent=BOSS_NAMES[bosses[0].boss]||'BOSS';
    const hp=bosses.reduce((s,b)=>s+b.hp,0), mx=bosses.reduce((s,b)=>s+(b.maxHp||1),0);
    $('bossfill').style.width=Math.max(0,100*hp/mx)+'%'; }
  else $('bossbar').style.display='none';
  // reconcile self
  if(m.you && self && level){
    const y=m.you;
    if(y.dead!==undefined) selfDead=y.dead;
    if(y.hp<selfHp){ shake(9); burst(self.x+PW/2,self.y+PH/2,14,C.ember,3.4,30); }
    self.x=y.x; self.y=y.y; self.vx=y.vx; self.vy=y.vy; self.onGround=y.onGround; self.coyote=y.coyote;
    self.jumps=y.jumps; self.face=y.face; self.dropThru=y.dropThru; self.buffer=y.buffer; self.pjump=y.pjump;
    self.dashT=y.dashT; self.dashCd=y.dashCd; if(y.dashX!==undefined){ self.dashX=y.dashX; self.dashY=y.dashY; }
    selfHp=y.hp; if(y.maxHp)myMaxHp=y.maxHp; dashCd=y.dashCd; myScore=y.score;
    pending=pending.filter(i=>i.seq>y.lastSeq);
    for(const i of pending) Physics.step(self,i.input,level);
  }
  updateHud();
}
let selfHp=5, selfDead=false, dashCd=0, myScore=0, mySlag=0, myBest=0, youHost=false, myMaxHp=5;
function updateHud(){ const h=$('hearts'); const mh=Math.max(1,myMaxHp||5); if(h.children.length!==mh){ h.innerHTML=''; for(let i=0;i<mh;i++){const d=document.createElement('div');d.className='h';h.appendChild(d);} }
  for(let i=0;i<mh;i++) h.children[i].classList.toggle('off', i>=selfHp);
  const inRun = level && level.kind==='run';
  $('hearts').style.display = inRun?'flex':'none';
  $('stat').textContent = inRun?`SCORE ${myScore}`:'';
  $('slag').textContent = `${mySlag} ◆`;
  // personal death overlay (you're down but the party fights on)
  const down = inRun && selfDead;
  $('death').classList.toggle('hidden', !down);
  if(down) $('deathline').textContent = 'Hold on — you revive when the wave is cleared.';
}
// run-end postmortem (Void Shell style summary)
function showPostmortem(m){
  shake(16); if(self) burst(self.x+PW/2,self.y+PH/2,30,C.bone,5,40);
  $('pmtitle').textContent = m.reason==='ended' ? 'RUN BANKED' : 'RUN OVER';
  $('pmsub').textContent = m.reason==='ended' ? 'The host closed the gate. Your haul is saved.' : 'The party fell. What you earned is saved.';
  const rec = m.bestWave!==undefined && m.wave>=m.bestWave;
  const stats=[['wave',m.wave],['score',m.score],['kills',m.kills],['bosses',m.bossKills],['best',m.bestWave??'—']];
  const grid=$('pmstats'); grid.innerHTML='';
  for(const [label,val] of stats){ const c=document.createElement('div'); c.className='cell'+(label==='wave'&&rec?' record':''); const b=document.createElement('b'); b.textContent=val; const s=document.createElement('span'); s.textContent=label; c.appendChild(b); c.appendChild(s); grid.appendChild(c); }
  $('pmslag').innerHTML = m.slag>0 ? `+${m.slag} slag ◆ &nbsp;·&nbsp; ${m.total??mySlag} total` : 'no slag earned this run';
  $('postmortem').classList.remove('hidden');
}
$('pmclose').onclick=()=>$('postmortem').classList.add('hidden');
// ---- shop ----
function openShop(){ renderShop(); $('shop').classList.remove('hidden'); }
function closeShop(){ $('shop').classList.add('hidden'); }
$('closeShop').onclick=closeShop;
function equipToggle(id,kind){ const cur=kind==='crest'?myCrest:myWake; const next=cur===id?null:id;
  const crest=kind==='crest'?next:myCrest, wake=kind==='wake'?next:myWake;
  if(ws&&connected)ws.send(JSON.stringify({type:'equip',crest,wake})); }
function renderShop(){ if($('shop').classList.contains('hidden'))return; $('shopSlag').textContent=`${mySlag} ◆`;
  const fill=(el,kind)=>{ el.innerHTML=''; for(const c of catalog.filter(x=>x.kind===kind)){ const has=owned.has(c.id); const worn=(kind==='crest'?myCrest:myWake)===c.id;
    const card=document.createElement('div'); card.className='cosmetic'+(worn?' on':'');
    const nm=document.createElement('div'); nm.className='cn'; nm.textContent=c.name; const cc=document.createElement('div'); cc.className='cc'; cc.textContent=has?'owned':`${c.cost} ◆`;
    const btn=document.createElement('button');
    if(!has){ btn.className='buy'; btn.textContent='Buy'; btn.disabled=mySlag<c.cost; btn.onclick=()=>ws&&ws.send(JSON.stringify({type:'buyCosmetic',id:c.id})); }
    else { btn.className=worn?'equipped':''; btn.textContent=worn?'Worn — remove':'Equip'; btn.onclick=()=>equipToggle(c.id,kind); }
    card.appendChild(nm); card.appendChild(cc); card.appendChild(btn); el.appendChild(card); } };
  fill($('shopCrests'),'crest'); fill($('shopWakes'),'wake'); }
$('btnEnd').onclick=()=>{ if(ws&&connected&&confirm('End the run for everyone and bank your slag?')) ws.send(JSON.stringify({type:'endRun'})); };

// ---------- input ----------
const held={left:false,right:false,jump:false,aimUp:false,aimDown:false};
let firing=false, mouseAim=localStorage.getItem('vs_mouse')==='1';
const mouse={x:400,y:300}; let lastAim={x:1,y:0};
function uiBlocking(){ return chatOpen() || !$('controls').classList.contains('hidden') || !$('runs').classList.contains('hidden') || !$('postmortem').classList.contains('hidden') || !$('shop').classList.contains('hidden'); }
function clearHeld(){ held.left=held.right=held.jump=held.aimUp=held.aimDown=false; firing=false; sendInput(); sendFire(false); }
function chatOpen(){ return !$('chatform').classList.contains('hidden'); }
function openChat(){ $('chatform').classList.remove('hidden'); $('chatinput').focus(); clearHeld(); }
function closeChat(){ $('chatform').classList.add('hidden'); $('chatinput').value=''; $('chatinput').blur(); }
$('chatform').addEventListener('submit',e=>{ e.preventDefault(); const t=$('chatinput').value; if(t.trim()&&ws&&connected)ws.send(JSON.stringify({type:'chat',text:t})); closeChat(); });
$('chatinput').addEventListener('keydown',e=>{ if(e.key==='Escape'){e.preventDefault();closeChat();} });

function computeAim(){ // returns normalized aim in game space
  if(mouseAim && self){ const wx=camX+mouse.x/zoom, wy=camY+mouse.y/zoom; let dx=wx-(self.x+Physics.PW/2), dy=wy-(self.y+Physics.PH/2); const l=Math.hypot(dx,dy)||1; return {x:dx/l,y:dy/l}; }
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
  myShots=myShots.filter(s=>{
    if(s.life<=0 || s.x<-10||s.x>level.width+10||s.y<-10||s.y>level.height+10 || shotHitsSolid(s)) return false;
    for(const [,e] of foeBuf){ const last=e.buf[e.buf.length-1]; if(!last)continue;
      if(s.x>last.x&&s.x<last.x+e.w&&s.y>last.y&&s.y<last.y+e.h){ burst(s.x,s.y,4,C.bone,1.6,12); return false; } }
    return true; });
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
    case 'nade': if(ws&&connected)ws.send(JSON.stringify({type:'nade'})); break;
    case 'interact': if(ws&&connected)ws.send(JSON.stringify({type:'interact'})); break;
  }
});
window.addEventListener('keyup',(e)=>{ const a=CODE2ACTION[e.code]; if(!a)return;
  if(a==='left'){held.left=false;} else if(a==='right'){held.right=false;}
  else if(a==='jump'){held.jump=false;} else if(a==='aimUp'){held.aimUp=false;}
  else if(a==='aimDown'){held.aimDown=false;} else if(a==='fire'){firing=false;sendFire(false);} });

const canvas=$('c'); const ctx=canvas.getContext('2d');
canvas.addEventListener('mousemove',e=>{ const r=canvas.getBoundingClientRect(); mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; });
canvas.addEventListener('mousedown',e=>{ if(e.button===0&&!uiBlocking()&&!firing){firing=true;sendFire(true);} });
window.addEventListener('mouseup',()=>{ if(firing){firing=false;sendFire(false);} });
document.addEventListener('visibilitychange',()=>{ if(document.hidden){hidden=true;clearHeld();} else {hidden=false; if(!connected)connect();} });
window.addEventListener('blur',clearHeld);

// ---------- run browser + chat ----------
function showRuns(runs){ const list=$('runlist'); list.innerHTML=''; if(!runs.length){ const e=document.createElement('div'); e.className='empty'; e.textContent='No open runs. Create one and friends can join.'; list.appendChild(e); }
  for(const r of runs){ const row=document.createElement('div'); row.className='runrow'; const meta=document.createElement('div');
    const host=document.createElement('div'); host.textContent=`${r.host}'s run`; const sub=document.createElement('div'); sub.className='meta'; sub.innerHTML=`${r.count}/${r.cap} · wave ${r.wave} · <span class="depth">${r.diffName||'Working depth'}</span>`;
    meta.appendChild(host); meta.appendChild(sub); const btn=document.createElement('button'); btn.className='primary small'; btn.textContent=r.count>=r.cap?'Full':'Join'; btn.disabled=r.count>=r.cap;
    btn.onclick=()=>ws&&ws.send(JSON.stringify({type:'joinRun',id:r.id})); row.appendChild(meta); row.appendChild(btn); list.appendChild(row); }
  renderDiffs(); $('runs').classList.remove('hidden'); }
const DIFF_NAMES=['Shallow','Working depth','Deep cut','Abyssal']; let selDiff=1;
function renderDiffs(){ const w=$('difflist'); if(!w)return; w.innerHTML='';
  DIFF_NAMES.forEach((name,i)=>{ const b=document.createElement('button'); b.textContent=name; if(i===selDiff)b.classList.add('sel'); b.onclick=()=>{ selDiff=i; renderDiffs(); }; w.appendChild(b); }); }
function closeRuns(){ $('runs').classList.add('hidden'); }
$('closeRuns').onclick=closeRuns; $('createRun').onclick=()=>ws&&ws.send(JSON.stringify({type:'createRun',diff:selDiff})); $('refreshRuns').onclick=()=>ws&&ws.send(JSON.stringify({type:'listRuns'}));
function scrollChat(){ const l=$('chatlog'); l.scrollTop=l.scrollHeight; }
function addChat(from,text,color){ const line=document.createElement('div'); const n=document.createElement('span'); n.className='name'; n.style.color=color||'#fff'; n.textContent=from+': '; const b=document.createElement('span'); b.textContent=text; line.appendChild(n); line.appendChild(b); $('chatlog').appendChild(line); trimChat(); scrollChat(); }
function addSys(text){ const l=document.createElement('div'); l.className='sys'; l.textContent=text; $('chatlog').appendChild(l); trimChat(); scrollChat(); }
function trimChat(){ const l=$('chatlog'); while(l.children.length>50)l.removeChild(l.firstChild); }

// ---------- render (760x440 scaled to fit) ----------
const PW=15,PH=21;
let VW=0,VH=0,camX=0,camY=0,zoom=2;
function resize(){ VW=canvas.width=innerWidth; VH=canvas.height=innerHeight; }
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
  if(f.kind==='boss'){ if(f.boss==='anvil')return drawAnvilVS(f); if(f.boss==='vesper')return drawVesperVS(f); if(f.boss==='chorus')return drawChorusVS(f); if(f.boss==='bore')return drawBoreVS(f); return drawMawVS(f); }
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

// --- the anvil, ported from Void Shell's drawAnvil() ---
function drawAnvilVS(f){
  const c=centerOf(f), FT=level.floorTop, lit=f.hit>0;
  if(f.airborne){ ctx.globalAlpha=0.32; ctx.fillStyle=C.pit; ctx.beginPath(); ctx.ellipse(c.x,FT+4,f.w*0.46,7,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }
  const wind=f.ch>0&&f.ph!=='walk'&&f.ph!=='entry'; const tell=wind&&Math.floor(f.ch/3)%2===0;
  ctx.fillStyle=C.stone; for(const sx of [-0.32,-0.1,0.12,0.34]) ctx.fillRect(c.x+f.w*sx-4,c.y+f.h*0.2,8,f.h*0.34);
  ctx.fillStyle=tell||lit?C.bone:C.stone; ctx.fillRect(f.x,f.y,f.w,f.h*0.62);
  ctx.strokeStyle=tell?C.rust:C.stoneLit; ctx.lineWidth=3; ctx.strokeRect(f.x+1.5,f.y+1.5,f.w-3,f.h*0.62-3);
  ctx.fillStyle=C.stoneLit; ctx.fillRect(f.x-7,f.y+f.h*0.16,8,f.h*0.3); ctx.fillRect(f.x+f.w-1,f.y+f.h*0.16,8,f.h*0.3);
  const heat=wind?(34-f.ch)/34:0.25; ctx.fillStyle=f.ph==='vent'?C.mint:C.rust; ctx.globalAlpha=0.4+heat*0.6;
  for(let i=-1;i<=1;i++) ctx.fillRect(c.x+i*17-5,f.y+f.h*0.2,10,5); ctx.globalAlpha=1;
  ctx.fillStyle=tell?C.ember:C.sulfur; ctx.beginPath(); ctx.arc(c.x,f.y+f.h*0.4,6+heat*4,0,Math.PI*2); ctx.fill();
}

// --- vesper, ported from Void Shell's drawVesper() ---
function drawVesperVS(f){
  const c=centerOf(f), lit=f.hit>0;
  if(f.blinkT>0){ const grow=1-f.blinkT/16, ex=f.bx+f.w/2, ey=f.by+f.h/2;
    ctx.globalAlpha=0.25+grow*0.55; ctx.strokeStyle=C.ember; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(ex+26,ey); ctx.lineTo(ex-6,ey-13); ctx.lineTo(ex-16,ey); ctx.lineTo(ex-6,ey+13); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha=0.5-grow*0.2; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(ex,ey,40-grow*26,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1; }
  const wind=f.ch>0&&(f.ph==='lance'||f.ph==='sweep'); const tell=wind&&Math.floor(f.ch/3)%2===0;
  const ang=f.ph==='sweep'&&f.ch<=0?Math.atan2(f.vy,f.vx):Math.atan2(f.ay||0,f.ax||1);
  if(wind){ ctx.strokeStyle=C.ember; ctx.globalAlpha=0.3+(30-f.ch)/55; ctx.lineWidth=f.ph==='sweep'?9:1.6; ctx.setLineDash([7,7]);
    ctx.beginPath(); ctx.moveTo(c.x,c.y); ctx.lineTo(c.x+(f.ax||1)*620,c.y+(f.ay||0)*620); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1; }
  ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(ang);
  ctx.strokeStyle=lit||tell?C.bone:C.stoneLit; ctx.lineWidth=4; ctx.lineCap='round';
  for(const sy of [-1,1]){ ctx.beginPath(); ctx.moveTo(-4,sy*5); ctx.lineTo(-24,sy*17); ctx.stroke(); }
  ctx.fillStyle=lit||tell?C.bone:C.stone; ctx.beginPath(); ctx.moveTo(26,0); ctx.lineTo(-6,-13); ctx.lineTo(-16,0); ctx.lineTo(-6,13); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=tell?C.ember:C.stoneLit; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle=tell?C.ember:C.sulfur; ctx.beginPath(); ctx.arc(6,0,5,0,Math.PI*2); ctx.fill(); ctx.restore();
}

// --- the chorus, ported from Void Shell's drawChorus() ---
function drawChorusVS(f){
  const c=centerOf(f), lit=f.hit>0, sword=f.role==='sword';
  const alone=[...foeBuf.values()].filter(e=>e.boss==='chorus').length===1;
  const wind=f.ph==='converge'&&f.ch>0, tell=wind&&Math.floor(f.ch/3)%2===0;
  if(sword){
    const br=66; for(let i=1;i<=4;i++){ ctx.globalAlpha=0.2-i*0.035; ctx.strokeStyle=C.bone; ctx.lineWidth=7;
      ctx.beginPath(); ctx.arc(c.x,c.y,br,f.blade-i*0.26,f.blade-(i-1)*0.26); ctx.stroke(); } ctx.globalAlpha=1;
    const bx=c.x+Math.cos(f.blade)*br, by=c.y+Math.sin(f.blade)*br;
    ctx.strokeStyle=C.stoneLit; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(c.x,c.y); ctx.lineTo(bx,by); ctx.stroke();
    ctx.save(); ctx.translate(bx,by); ctx.rotate(f.blade+Math.PI/2); ctx.fillStyle=C.bone;
    ctx.beginPath(); ctx.moveTo(0,-19); ctx.lineTo(7,4); ctx.lineTo(0,13); ctx.lineTo(-7,4); ctx.closePath(); ctx.fill();
    ctx.fillStyle=C.ember; ctx.fillRect(-2,-16,4,13); ctx.restore();
  } else {
    const ga=Math.atan2(f.gy||1,f.gx||0);
    ctx.strokeStyle=f.guard?(lit?C.bone:C.stoneLit):C.stone; ctx.lineWidth=f.guard?8:5; ctx.globalAlpha=f.guard?1:0.45;
    ctx.beginPath(); ctx.arc(c.x,c.y,30,ga-0.95,ga+0.95); ctx.stroke();
    if(f.guard){ ctx.strokeStyle=C.mint; ctx.lineWidth=1.6; ctx.globalAlpha=0.55+Math.sin(f.t*0.09)*0.25; ctx.beginPath(); ctx.arc(c.x,c.y,35,ga-0.95,ga+0.95); ctx.stroke(); }
    ctx.globalAlpha=1; ctx.strokeStyle=lit?C.bone:C.stoneLit; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(c.x,c.y); ctx.lineTo(c.x+Math.cos(ga)*26,c.y+Math.sin(ga)*26); ctx.stroke();
  }
  ctx.fillStyle=lit||tell?C.bone:C.stone; ctx.beginPath(); ctx.arc(c.x,c.y,f.w*0.34,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=tell?C.ember:C.stoneLit; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle=alone?C.ember:C.rust; ctx.beginPath(); ctx.arc(c.x,c.y,5.5+Math.sin(f.t*0.12)*1.4,0,Math.PI*2); ctx.fill();
}

// --- the bore, ported from Void Shell's drawBore() ---
function drawBoreVS(f){
  if(f.ph==='lurk'){
    const t=1-f.ch/26, ex=f.fx, ey=f.fy;
    ctx.strokeStyle=C.ember; ctx.globalAlpha=0.10+t*0.16; ctx.lineWidth=34;
    ctx.beginPath(); ctx.moveTo(ex,ey); ctx.lineTo(ex+f.ax*900,ey+f.ay*900); ctx.stroke();
    ctx.globalAlpha=0.45+t*0.5; ctx.lineWidth=2.4; ctx.setLineDash([6,8]);
    ctx.beginPath(); ctx.moveTo(ex,ey); ctx.lineTo(ex+f.ax*900,ey+f.ay*900); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth=3+t*4; ctx.beginPath();
    for(let i=0;i<7;i++){ const a=(i/7)*Math.PI*2+f.t*0.02, r=(10+t*34)*(i%2?0.6:1); ctx.moveTo(ex,ey); ctx.lineTo(ex+Math.cos(a)*r,ey+Math.sin(a)*r); }
    ctx.stroke(); ctx.globalAlpha=1; return;
  }
  const tr=f.tr||[]; for(let i=tr.length-1;i>=0;i--){ const r=17*(1-i*6/110)+4;
    ctx.fillStyle=f.hit>0?C.stoneLit:C.stone; ctx.beginPath(); ctx.arc(tr[i][0],tr[i][1],r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=C.rust; ctx.lineWidth=2; ctx.globalAlpha=0.85; ctx.beginPath(); ctx.arc(tr[i][0],tr[i][1],r,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1; }
  const c=centerOf(f); ctx.fillStyle=f.hit>0?C.bone:C.stoneLit; ctx.beginPath(); ctx.arc(c.x,c.y,21,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=C.ember; ctx.beginPath(); ctx.arc(c.x,c.y,6,0,Math.PI*2); ctx.fill();
}
function drawQuakes(qs){
  const FT=level.floorTop; if(!qs)return;
  for(const q of qs){ const a=Math.max(0,1-q.t/150); ctx.globalAlpha=0.5*a; ctx.fillStyle=C.stoneLit;
    ctx.beginPath(); ctx.moveTo(q.x-11,FT); ctx.lineTo(q.x,FT-22-6*a); ctx.lineTo(q.x+11,FT); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=0.3*a; ctx.fillStyle=C.rust; ctx.fillRect(q.x-13,FT-4,26,6); }
  ctx.globalAlpha=1;
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

function drawGate(d){
  const gx=d.x, gy=d.y, gw=d.w, gh=d.h, cx=gx+gw/2, t=performance.now()/1000;
  // portal glow (pulsing)
  const pulse=0.5+0.5*Math.sin(t*2);
  const grad=ctx.createRadialGradient(cx,gy+gh*0.55,4,cx,gy+gh*0.55,gw*0.7);
  grad.addColorStop(0,C.mint); grad.addColorStop(0.5,'rgba(127,196,168,'+(0.35+0.25*pulse)+')'); grad.addColorStop(1,'rgba(127,196,168,0)');
  ctx.fillStyle=grad; ctx.fillRect(gx-gw*0.3,gy,gw*1.6,gh);
  // portal arch (filled)
  ctx.fillStyle=C.pit; ctx.beginPath();
  ctx.moveTo(gx+10,gy+gh); ctx.lineTo(gx+10,gy+34);
  ctx.arc(cx,gy+34,gw/2-10,Math.PI,0); ctx.lineTo(gx+gw-10,gy+gh); ctx.closePath(); ctx.fill();
  // shimmering inner portal
  ctx.save(); ctx.globalAlpha=0.5+0.3*pulse; ctx.fillStyle=C.mint;
  ctx.beginPath(); ctx.moveTo(cx-gw*0.28,gy+gh-8); ctx.lineTo(cx-gw*0.28,gy+40);
  ctx.arc(cx,gy+40,gw*0.28,Math.PI,0); ctx.lineTo(cx+gw*0.28,gy+gh-8); ctx.closePath(); ctx.fill(); ctx.restore();
  // pillars
  ctx.fillStyle=C.stone; ctx.fillRect(gx-14,gy+6,20,gh-6); ctx.fillRect(gx+gw-6,gy+6,20,gh-6);
  ctx.fillStyle=C.stoneLit; ctx.fillRect(gx-14,gy+6,20,8); ctx.fillRect(gx+gw-6,gy+6,20,8);
  // lintel
  ctx.fillStyle=C.stone; ctx.fillRect(gx-16,gy-6,gw+32,16);
  ctx.fillStyle=C.stoneLit; ctx.fillRect(gx-16,gy-6,gw+32,4);
  // rune sigils along the lintel
  ctx.fillStyle=C.sulfur; for(let i=0;i<5;i++){ ctx.fillRect(gx+8+i*(gw-16)/4-2,gy-3,4,4); }
  // label
  ctx.fillStyle=C.bone; ctx.font='bold 15px ui-monospace,monospace'; ctx.textAlign='center';
  ctx.fillText('RUNS',cx,gy-14);
}

// grenades — 5px pip that blinks hot near its fuse (Void Shell drawNades)
function drawNades(){ for(const g of nades){ const hot=g.fuse<22 && Math.floor(g.fuse/4)%2===0; ctx.fillStyle=hot?C.sulfur:C.bone; ctx.fillRect(g.x,g.y,5,5); } }
// blast rings — expand + fade over 16 frames (Void Shell drawBlasts)
function drawBlasts(){ for(let i=blasts.length-1;i>=0;i--){ const e=blasts[i]; e.t++; if(e.t>16){blasts.splice(i,1);continue;} const t=e.t/16;
  ctx.globalAlpha=(1-t)*0.75; ctx.strokeStyle=C.sulfur; ctx.lineWidth=3*(1-t)+1; ctx.beginPath(); ctx.arc(e.x,e.y,e.r*(0.25+t*0.85),0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1; } }
// worn crests — ported verbatim from Void Shell's drawCrestShape
function drawCrestShape(id,hx,hy,t){ const g=ctx, TAU=Math.PI*2;
  if(id==='lamp'){ g.fillStyle=C.stoneLit; g.fillRect(hx-3,hy-6,6,5); const flick=0.7+Math.sin(t*3)*0.2; const glow=g.createRadialGradient(hx,hy-5,0,hx,hy-5,34); glow.addColorStop(0,C.sulfur); glow.addColorStop(1,'rgba(0,0,0,0)'); g.globalAlpha=0.32*flick; g.fillStyle=glow; g.beginPath(); g.arc(hx,hy-5,34,0,TAU); g.fill(); g.globalAlpha=1; g.fillStyle=C.sulfur; g.beginPath(); g.arc(hx,hy-4,2.2,0,TAU); g.fill(); }
  if(id==='horns'){ g.strokeStyle=C.bone; g.lineWidth=2.4; g.lineCap='round'; for(const sx of [-1,1]){ g.beginPath(); g.moveTo(hx+sx*4,hy); g.quadraticCurveTo(hx+sx*11,hy-5,hx+sx*8,hy-12); g.stroke(); } }
  if(id==='plume'){ const sway=Math.sin(t*1.6)*3; g.strokeStyle=C.stoneLit; g.lineWidth=2; g.beginPath(); g.moveTo(hx,hy); g.quadraticCurveTo(hx+4,hy-9,hx+sway,hy-17); g.stroke(); g.fillStyle=C.ember; g.beginPath(); g.ellipse(hx+sway,hy-18,3.2,6,sway*0.06,0,TAU); g.fill(); }
  if(id==='crown'){ g.fillStyle=C.sulfur; for(const [dx,h] of [[-6,7],[0,11],[6,7]]){ g.beginPath(); g.moveTo(hx+dx-2.4,hy); g.lineTo(hx+dx,hy-h); g.lineTo(hx+dx+2.4,hy); g.closePath(); g.fill(); } }
  if(id==='halo'){ const wob=Math.sin(t*1.2)*2; g.strokeStyle=C.rust; g.lineWidth=2.2; g.globalAlpha=0.9; g.beginPath(); g.ellipse(hx,hy-10+wob*0.3,11,3.6+wob*0.2,0,0,TAU); g.stroke(); g.globalAlpha=1; } }
// wake trails — spawn particle bits per Void Shell WAKE_LOOK
function emitWake(x,y,id){ const w=WAKE_LOOK[id]; if(!w||Math.random()>0.6)return; const a=Math.random()*Math.PI*2, s=w.speed*(0.3+Math.random()*0.8);
  bits.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-0.3,life:w.life*(0.6+Math.random()*0.5),max:w.life,color:w.color(),size:w.size,grav:w.grav}); }
// a little market stall for the shop door
function drawShop(d){ const x=d.x,y=d.y,w=d.w,h=d.h,cx=x+w/2;
  ctx.fillStyle=C.stone; ctx.fillRect(x-6,y+22,10,h-22); ctx.fillRect(x+w-4,y+22,10,h-22);           // posts
  ctx.fillStyle=C.pit; ctx.fillRect(x-2,y+40,w+4,h-40);                                              // counter back
  ctx.fillStyle=C.stoneLit; ctx.fillRect(x-2,y+h-14,w+4,14);                                         // counter
  for(let i=0;i<7;i++){ ctx.fillStyle=i%2?C.ember:C.bone; ctx.beginPath(); ctx.moveTo(x-8+i*(w+16)/6,y+18); ctx.lineTo(x-8+(i+1)*(w+16)/6,y+18); ctx.lineTo(x-8+(i+0.5)*(w+16)/6,y+32); ctx.closePath(); ctx.fill(); } // awning
  ctx.fillStyle=C.sulfur; ctx.font='bold 14px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText('SHOP',cx,y+12);
  ctx.fillStyle=C.sulfur; ctx.beginPath(); ctx.arc(cx,y+h-26,6,0,Math.PI*2); ctx.fill(); ctx.fillStyle=C.pit; ctx.font='9px ui-monospace,monospace'; ctx.fillText('◆',cx,y+h-23); }

function draw(){
  ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=C.pit; ctx.fillRect(0,0,VW,VH);
  if(!level||!me||!self){ requestAnimationFrame(draw); return; }
  const now=performance.now();
  const worldW=level.width, worldH=level.height;
  // follow camera — fixed visible world height (zoomed in); clamps to world bounds
  const viewH=Math.min(worldH, 520); zoom=VH/viewH; const viewW=VW/zoom;
  let tx=self.x+PW/2 - viewW/2, ty=self.y+PH/2 - viewH/2;
  camX = worldW<=viewW ? (worldW-viewW)/2 : Math.max(0, Math.min(worldW-viewW, tx));
  camY = worldH<=viewH ? (worldH-viewH)/2 : Math.max(0, Math.min(worldH-viewH, ty));
  let shx=0,shy=0; if(shakeAmt>0.4){ shx=(Math.random()*2-1)*shakeAmt*zoom; shy=(Math.random()*2-1)*shakeAmt*zoom; shakeAmt*=0.86; }
  ctx.setTransform(zoom,0,0,zoom, -camX*zoom+shx, -camY*zoom+shy);
  // backdrop + subtle grid
  ctx.fillStyle=C.pitLit; ctx.fillRect(0,0,worldW,worldH);
  ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=1;
  const g=80; for(let x=Math.floor(camX/g)*g;x<camX+viewW;x+=g){ ctx.beginPath(); ctx.moveTo(x,camY); ctx.lineTo(x,camY+viewH); ctx.stroke(); }
  for(let y=Math.floor(camY/g)*g;y<camY+viewH;y+=g){ ctx.beginPath(); ctx.moveTo(camX,y); ctx.lineTo(camX+viewW,y); ctx.stroke(); }
  // platforms
  for(const p of level.platforms){ ctx.fillStyle=p.solid?C.stone:C.stoneLit; ctx.fillRect(p.x,p.y,p.w,p.h); if(!p.solid){ctx.fillStyle=C.stone;ctx.fillRect(p.x,p.y+3,p.w,p.h-3);} }
  // doors — gate art if flagged, else a plain marker
  for(const d of (level.doors||[])){ if(d.gate){ drawGate(d); } else if(d.shop){ drawShop(d); } else { ctx.fillStyle='rgba(214,198,60,0.18)'; ctx.fillRect(d.x,d.y,d.w,d.h); ctx.strokeStyle=C.sulfur; ctx.lineWidth=2; ctx.strokeRect(d.x,d.y,d.w,d.h);
    ctx.fillStyle=C.sulfur; ctx.font='11px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(d.label,d.x+d.w/2,d.y-6); } }
  let promptDoor=null; for(const d of (level.doors||[])) if(self.x<d.x+d.w&&self.x+PW>d.x&&self.y<d.y+d.h&&self.y+PH>d.y) promptDoor=d;
  drawQuakes(quakes);

  const TICK=1000/60;
  const sclamp=Math.min(Math.max((now-foesAt)/TICK,0),4);
  // foes — extrapolated forward from the last 30Hz snapshot for smooth 60fps motion
  for(const [,e] of foeBuf){ const last=e.buf[e.buf.length-1]; if(!last)continue;
    const et=Math.min(Math.max((now-e.atMs)/TICK,0),3);
    const ef={kind:e.kind,boss:e.boss,w:e.w,h:e.h,hit:e.hit,phase:e.ph,charge:e.ch,ph:e.ph,ch:e.ch,vx:e.vx,vy:e.vy,
      role:e.role,guard:e.guard,airborne:e.airborne,armored:e.armored,blade:e.blade,twin:e.twin,blinkT:e.blinkT,
      bx:e.bx,by:e.by,ax:e.ax,ay:e.ay,gx:e.gx,gy:e.gy,fx:e.fx,fy:e.fy,tr:e.tr,
      x:last.x+(e.vx||0)*et, y:last.y+(e.vy||0)*et, t:(e.serverT||0)+et};
    drawFoeVS(ef); }
  // foe shots — extrapolated (with gravity for lobs), Void Shell bullet look
  for(const b of fshots){ const bx=b.x+(b.vx||0)*sclamp, by=b.y+(b.vy||0)*sclamp+(b.g?0.5*b.g*sclamp*sclamp:0); drawFoeShotVS(bx,by,b.r,b.color); }
  // player bullets — others' from the server (extrapolated); own are predicted below
  for(const b of pshots){ if(b.owner===(me&&me.id))continue; const bx=b.x+(b.vx||0)*sclamp, by=b.y+(b.vy||0)*sclamp; drawBolt(bx,by,b.vx,b.vy,b.color); }
  // own predicted shots (instant feedback; server authoritative for hits)
  const col=myColor||C.mint;
  for(const s of myShots){ drawBolt(s.x,s.y,s.vx,s.vy,col); }
  // grenades + blasts (Void Shell)
  drawNades(); drawBlasts();
  // particle bits
  drawBits();
  // remotes (with crest + wake)
  const rt=now-100;
  for(const [,r] of remotes){ const s=remoteAt(r,rt); if(!s)continue;
    let spd=0; const bb=r.buffer; if(bb.length>=2){ const p2=bb[bb.length-1],p1=bb[bb.length-2]; spd=Math.hypot(p2.x-p1.x,p2.y-p1.y); }
    drawPlayer(s.x,s.y,s.face,r.color,r.dead,r.iframes,s.face,0);
    if(r.crest) drawCrestShape(r.crest, s.x+PW/2, s.y+2, now/1000);
    if(r.wake && spd>1.6) emitWake(s.x+PW/2, s.y+PH*0.7, r.wake);
    ctx.fillStyle=C.bone; ctx.font='10px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(r.name||'',s.x+PW/2,s.y-6); }
  // self (with crest + wake)
  const a=computeAim(); drawPlayer(self.x,self.y,self.face,myColor||C.mint,selfDead,0,a.x,a.y);
  if(myCrest) drawCrestShape(myCrest, self.x+PW/2, self.y+2, now/1000);
  if(myWake && (Math.abs(self.vx)+Math.abs(self.vy)>2 || self.dashT>0)) emitWake(self.x+PW/2, self.y+PH*0.7, myWake);

  // prompt + reticle (screen space)
  ctx.setTransform(1,0,0,1,0,0);
  if(promptDoor&&!uiBlocking()){ $('prompt').classList.remove('hidden'); const verb=promptDoor.type==='leave'?'exit':promptDoor.type==='shop'?'open the shop':'open runs'; $('prompt').innerHTML=`Press <kbd>${prettyKey(binds.interact[0])}</kbd> to ${verb}`; }
  else $('prompt').classList.add('hidden');
  if(mouseAim && !uiBlocking()){ ctx.strokeStyle=C.bone; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,6,0,Math.PI*2); ctx.stroke(); }

  sendAim();
  requestAnimationFrame(draw);
}

function startGame(username){ $('auth').classList.add('hidden'); $('game').classList.remove('hidden'); connect(); setInterval(sendInput, 1000/60); draw(); }
