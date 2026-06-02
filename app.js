'use strict';

// ── STORAGE (localStorage) ────────────────────────────────
var META_KEY = 'scm_meta_desktop';
function metaSave(){
  try{
    var list=tracks.map(function(t){return{id:t.id,name:t.name,type:t.type,dur:t.dur||0,durStr:t.durStr||'--:--',path:t.path};});
    localStorage.setItem(META_KEY,JSON.stringify({list:list,idx:curIdx}));
  }catch(e){}
}
function metaLoad(){try{var r=localStorage.getItem(META_KEY);return r?JSON.parse(r):null;}catch(e){return null;}}

// ── DOM ───────────────────────────────────────────────────
var videoEl   = document.getElementById('videoEl');
var waveWrap  = document.getElementById('waveWrap');
var videoWrap = document.getElementById('videoWrap');
var noMsg     = document.getElementById('noMsg');
var noVidMsg  = document.getElementById('noVidMsg');
var vizCanvas = document.getElementById('waveCanvas');
var vizCtx    = vizCanvas ? vizCanvas.getContext('2d') : null;
var vizMode   = parseInt(localStorage.getItem('sm_vizMode')||'0',10);

// ── Skin ─────────────────────────────────────────────────
var savedTheme = localStorage.getItem('sm_theme')||'skin-gold';
document.body.className = savedTheme;
document.querySelectorAll('.sk').forEach(function(c){
  c.classList.toggle('active',c.dataset.s===savedTheme);
  c.addEventListener('click',function(){
    document.body.className=this.dataset.s;
    localStorage.setItem('sm_theme',this.dataset.s);
    document.querySelectorAll('.sk').forEach(function(x){x.classList.remove('active');});
    this.classList.add('active');
  });
});
var bp=document.getElementById('borderColor');
if(bp){var sb=localStorage.getItem('sm_border')||'#D4A017';document.body.style.borderColor=sb;bp.value=sb;bp.addEventListener('input',function(){document.body.style.borderColor=this.value;localStorage.setItem('sm_border',this.value);});}

// ── View Mode ─────────────────────────────────────────────
var viewMode = localStorage.getItem('sm_viewMode')||'wave';
function applyViewMode(){
  var iv=viewMode==='video';
  var mi=document.getElementById('mBtnI'),ml=document.getElementById('mBtnL');
  if(mi)mi.textContent=iv?'📊':'🎬'; if(ml)ml.textContent=iv?'Wave':'Video';
  waveWrap.style.display=iv?'none':'block';
  videoWrap.style.display=iv?'flex':'none';
  var eq=document.getElementById('eqSec');if(eq)eq.classList.toggle('hidden',iv);
}
applyViewMode();
var mb=document.getElementById('modeBtn');
if(mb)mb.addEventListener('click',function(){viewMode=viewMode==='wave'?'video':'wave';localStorage.setItem('sm_viewMode',viewMode);applyViewMode();});

// ── Audio Engine ──────────────────────────────────────────
var audioCtx=null,analyser=null,gainNode=null,eqFilters=[];
var srcNode=null,audioBuf=null,startedAt=0,pausedAt=0;
var videoMSrc=null;
var EQ_FREQS=[60,170,310,600,1000,3000,6000,12000,14000,16000];
var EQ_LABELS=['60Hz','170','310','600','1k','3k','6k','12k','14k','16k'];

function initAudio(){
  if(audioCtx)return;
  audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  analyser=audioCtx.createAnalyser();analyser.fftSize=2048;
  gainNode=audioCtx.createGain();gainNode.gain.value=parseInt(document.getElementById('volSl').value,10)/100;
  eqFilters=EQ_FREQS.map(function(freq,i){var f=audioCtx.createBiquadFilter();f.type=i===0?'lowshelf':i===EQ_FREQS.length-1?'highshelf':'peaking';f.frequency.value=freq;f.gain.value=0;f.Q.value=1.4;return f;});
  for(var k=0;k<eqFilters.length-1;k++)eqFilters[k].connect(eqFilters[k+1]);
  eqFilters[eqFilters.length-1].connect(analyser);analyser.connect(gainNode);gainNode.connect(audioCtx.destination);
}
function connectVideoAudio(){
  if(!analyser||!audioCtx)return;
  if(!videoMSrc){try{videoMSrc=audioCtx.createMediaElementSource(videoEl);}catch(e){return;}}
  try{videoMSrc.disconnect();}catch(e){}
  try{videoMSrc.connect(eqFilters[0]||gainNode);}catch(e){}
}
function resumeCtx(cb){initAudio();if(audioCtx.state==='suspended')audioCtx.resume().then(cb);else cb();}

// ── State ─────────────────────────────────────────────────
var isPlaying=false,doShuffle=false,doRepeat=false;
var discAngle=0,discRAF=null,plFilter='all';
var tracks=[],curIdx=0;

function curTrack(){return tracks[curIdx]||null;}
function isVidExt(name){return /\.(mp4|webm|mkv|mov|avi|m4v)$/i.test(name);}
function fmt(s){var m=Math.floor(s/60),sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec;}
function setStatus(s){var el=document.getElementById('statusDot');if(el)el.className='status-led '+(s==='playing'?'playing':'paused');}
function showErr(msg){var el=document.getElementById('errMsg');if(!el)return;el.textContent=msg;el.style.display='block';setTimeout(function(){el.style.display='none';},6000);}
function setSave(msg,delay){var el=document.getElementById('saveStatus');if(!el)return;el.textContent=msg;if(delay)setTimeout(function(){if(el.textContent===msg)el.textContent='';},delay);}
function updateInfo(){var el=document.getElementById('storageInfo');if(el)el.textContent=tracks.length>0?'💾 '+tracks.length+' ไฟล์ในรายการ':'';}

// ── STOP ALL ──────────────────────────────────────────────
function stopAll(){
  isPlaying=false;
  if(srcNode){srcNode.onended=null;try{srcNode.stop();}catch(e){}try{srcNode.disconnect();}catch(e){}srcNode=null;}
  videoEl.onended=null;
  try{if(!videoEl.paused)videoEl.pause();}catch(e){}
  stopDisc();setStatus('paused');
  document.getElementById('btnPlay').textContent='▶';
}

// ── ADD FILES from Electron dialog ────────────────────────
async function openFileDialog(){
  if(!window.electronAPI){document.getElementById('fileInput').click();return;}
  var paths = await window.electronAPI.openFiles();
  if(!paths||!paths.length)return;
  addFilePaths(paths);
}

function addFilePaths(paths){
  var startLen=tracks.length;
  setSave('⏳ กำลังเพิ่ม '+paths.length+' ไฟล์...');
  plFilter='all';
  document.querySelectorAll('.fbtn').forEach(function(b){b.classList.toggle('active',b.dataset.f==='all');});

  paths.forEach(function(filePath){
    var name = filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/,'');
    var type = isVidExt(filePath)?'video':'audio';
    var id   = 'p'+Date.now()+'_'+Math.round(Math.random()*99999);
    tracks.push({id:id,name:name,type:type,dur:0,durStr:'--:--',path:filePath});
  });

  metaSave();updateInfo();renderPL();
  setSave('✅ เพิ่ม '+paths.length+' ไฟล์',3000);
  if(!isPlaying&&tracks.length>startLen){
    curIdx=startLen; play(tracks[startLen].id,startLen);
  }
}

// ── PLAY ──────────────────────────────────────────────────
function play(id,idx){
  stopAll();audioBuf=null;curIdx=idx;
  var t=tracks[idx];if(!t)return;
  noMsg.style.display='none';
  document.getElementById('errMsg').style.display='none';
  document.getElementById('tname').textContent=t.name;
  document.getElementById('tartist').textContent=t.type==='video'?'VIDEO · SUOMSIANGCRYPTO':'SUOMSIANGCRYPTO MUSIC';
  document.getElementById('tot').textContent=t.durStr!=='--:--'?t.durStr:'โหลด...';
  var badge=document.getElementById('artBadge');
  badge.textContent=t.type==='video'?'MP4':'MP3';badge.className='art-badge show';
  if(t.type==='video'&&viewMode!=='video'){viewMode='video';localStorage.setItem('sm_viewMode','video');applyViewMode();}
  else if(t.type==='audio'&&viewMode!=='wave'){viewMode='wave';localStorage.setItem('sm_viewMode','wave');applyViewMode();}
  renderPL();

  // โหลดผ่าน file:// URL โดยตรง — ไม่จำกัดขนาด ไม่ต้อง encode
  if(window.electronAPI){
    window.electronAPI.getFileUrl(t.path).then(function(url){
      if(t.type==='video') playVideoUrl(t,url);
      else                 playAudioUrl(t,url);
    });
  }
}

// ── PLAY VIDEO ────────────────────────────────────────────
function playVideoUrl(t,url){
  initAudio();
  var oldUrl=videoEl.src&&videoEl.src.startsWith('blob:')?videoEl.src:null;
  videoEl.src=url;
  if(oldUrl)URL.revokeObjectURL(oldUrl);
  videoEl.volume=parseInt(document.getElementById('volSl').value,10)/100;
  videoEl.loop=false;videoEl.load();

  videoEl.onloadedmetadata=function(){
    t.dur=videoEl.duration;t.durStr=fmt(videoEl.duration);
    document.getElementById('tot').textContent=t.durStr;
    metaSave();renderPL();
    resumeCtx(function(){
      connectVideoAudio();
      videoEl.play().then(function(){
        isPlaying=true;document.getElementById('btnPlay').textContent='⏸';
        startDisc();setStatus('playing');noVidMsg.style.display='none';
        videoEl.onended=function(){
          videoEl.onended=null;
          if(doRepeat){videoEl.currentTime=0;videoEl.play().catch(function(){});return;}
          isPlaying=false;stopDisc();setStatus('paused');document.getElementById('btnPlay').textContent='▶';
          autoNext();
        };
      }).catch(function(e){showErr('เล่นวิดีโอไม่ได้: '+e.message);});
    });
  };
  videoEl.onerror=function(){showErr('โหลดวิดีโอไม่ได้: '+t.name);};
}

// ── PLAY AUDIO — ไม่จำกัดขนาด ────────────────────────────
function playAudioUrl(t,url){
  initAudio();
  if(videoMSrc){try{videoMSrc.disconnect();}catch(e){}}
  try{if(!videoEl.paused)videoEl.pause();}catch(e){}
  videoEl.src='';

  // ใช้ fetch โหลดเป็น ArrayBuffer — รองรับไฟล์ใหญ่ได้ไม่จำกัด
  fetch(url).then(function(res){
    return res.arrayBuffer();
  }).then(function(ab){
    resumeCtx(function(){
      audioCtx.decodeAudioData(ab,function(buf){
        audioBuf=buf;t.dur=buf.duration;t.durStr=fmt(buf.duration);
        document.getElementById('tot').textContent=t.durStr;
        metaSave();renderPL();startAudioFrom(0);
      },function(err){showErr('ไม่รองรับไฟล์: '+t.name);console.error(err);});
    });
  }).catch(function(e){showErr('โหลดไม่ได้: '+e.message);});
}

function startAudioFrom(offset){
  if(!audioBuf)return;
  if(srcNode){srcNode.onended=null;try{srcNode.stop();}catch(e){}try{srcNode.disconnect();}catch(e){}srcNode=null;}
  resumeCtx(function(){
    srcNode=audioCtx.createBufferSource();srcNode.buffer=audioBuf;
    srcNode.connect(eqFilters[0]||gainNode);
    srcNode.start(0,offset);startedAt=audioCtx.currentTime-offset;pausedAt=offset;
    isPlaying=true;document.getElementById('btnPlay').textContent='⏸';
    startDisc();setStatus('playing');
    srcNode.onended=function(){
      if(doRepeat){startAudioFrom(0);return;}
      isPlaying=false;stopDisc();setStatus('paused');document.getElementById('btnPlay').textContent='▶';
      autoNext();
    };
  });
}

function autoNext(){
  if(!tracks.length)return;
  curIdx=doShuffle?Math.floor(Math.random()*tracks.length):(curIdx+1)%tracks.length;
  metaSave();play(tracks[curIdx].id,curIdx);
}

function togglePlay(){
  if(!tracks.length){openFileDialog();return;}
  initAudio();var t=curTrack();if(!t)return;
  if(t.type==='video'){
    if(isPlaying){videoEl.onended=null;videoEl.pause();isPlaying=false;stopDisc();setStatus('paused');document.getElementById('btnPlay').textContent='▶';}
    else{resumeCtx(function(){videoEl.play().then(function(){isPlaying=true;startDisc();setStatus('playing');document.getElementById('btnPlay').textContent='⏸';videoEl.onended=function(){videoEl.onended=null;if(doRepeat){videoEl.currentTime=0;videoEl.play().catch(function(){});return;}isPlaying=false;stopDisc();setStatus('paused');document.getElementById('btnPlay').textContent='▶';autoNext();};}).catch(function(e){showErr(e.message);});});}
  } else {
    if(isPlaying){pausedAt=audioCtx.currentTime-startedAt;if(srcNode){srcNode.onended=null;try{srcNode.stop();}catch(e){}try{srcNode.disconnect();}catch(e){}srcNode=null;}isPlaying=false;stopDisc();setStatus('paused');document.getElementById('btnPlay').textContent='▶';}
    else{if(!audioBuf)play(t.id,curIdx);else startAudioFrom(pausedAt);}
  }
}

// ── DISC ──────────────────────────────────────────────────
function startDisc(){cancelAnimationFrame(discRAF);(function s(){discAngle=(discAngle+1.5)%360;var el=document.getElementById('discSvg');if(el)el.style.transform='rotate('+discAngle+'deg)';discRAF=requestAnimationFrame(s);})();}
function stopDisc(){cancelAnimationFrame(discRAF);discRAF=null;}

// ── VISUALIZER ────────────────────────────────────────────
var rainD=[],vizP=[];
for(var _ri=0;_ri<55;_ri++)rainD.push({x:Math.random()*460,y:Math.random()*100,len:8+Math.random()*25,spd:2+Math.random()*4,al:0.2+Math.random()*0.5});
for(var _pi=0;_pi<70;_pi++)vizP.push({x:Math.random()*460,y:Math.random()*100,vx:(Math.random()-.5)*.8,vy:(Math.random()-.5)*.8,r:1+Math.random()*2.5,al:0.3+Math.random()*0.6});
function hexA(hex,a){var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return'rgba('+r+','+g+','+b+','+a+')';}
function getTC(){var s=getComputedStyle(document.body);return{a1:s.getPropertyValue('--a1').trim()||'#C8902A',a2:s.getPropertyValue('--a2').trim()||'#F5C842'};}

function drawViz(fArr,tdArr,elapsed){
  if(!vizCanvas||!vizCtx)return;
  var dW=vizCanvas.offsetWidth||460,dH=vizCanvas.offsetHeight||100;
  if(dW===0||dH===0)return;
  if(vizCanvas.width!==dW*2){vizCanvas.width=dW*2;vizCanvas.height=dH*2;}
  var ctx=vizCtx;ctx.save();ctx.scale(2,2);
  ctx.clearRect(0,0,dW,dH);ctx.fillStyle='#080A0E';ctx.fillRect(0,0,dW,dH);
  var tc=getTC(),a1=tc.a1,a2=tc.a2;
  var f=new Float32Array(128),td=new Float32Array(512);
  if(fArr){for(var i=0;i<Math.min(fArr.length,128);i++)f[i]=fArr[i]/255;}
  else{var ph=elapsed*.8;for(var i=0;i<128;i++)f[i]=Math.max(0,Math.pow(1-i/128,2)*.5+Math.sin(i*.3+ph)*.15);}
  if(tdArr){for(var i=0;i<Math.min(tdArr.length,512);i++)td[i]=(tdArr[i]/128)-1;}
  else{for(var i=0;i<512;i++)td[i]=Math.sin(i*.05+elapsed*2)*.35+Math.sin(i*.013+elapsed*3)*.18;}
  var cw=dW,ch=dH;
  if(vizMode===0){for(var i=0;i<80;i++){var v=f[Math.floor(i*128/80)],bh=v*ch*.9,x=i*(cw/80),bw=cw/80*.78;var g=ctx.createLinearGradient(0,ch,0,ch-bh);g.addColorStop(0,a1);g.addColorStop(.6,a2);g.addColorStop(1,'#fffae0');ctx.fillStyle=g;ctx.fillRect(x,ch-bh,bw,bh);ctx.fillStyle=hexA(a2,v*.7);ctx.fillRect(x,ch-bh-2,bw,2);}ctx.strokeStyle=hexA(a2,.15);ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(0,ch-.5);ctx.lineTo(cw,ch-.5);ctx.stroke();}
  else if(vizMode===1){var cx=cw/2,cy=ch/2,r0=Math.min(cw,ch)*.17;for(var i=0;i<120;i++){var v=f[Math.floor(i*128/120)],ang=i/120*Math.PI*2-Math.PI/2,r2=r0+v*(Math.min(cw,ch)*.42-r0-4);ctx.strokeStyle='rgba('+Math.round(200+55*i/120)+','+Math.round(144+80*(1-i/120))+',42,'+(0.4+v*.6)+')';ctx.lineWidth=1.5+v*2;ctx.beginPath();ctx.moveTo(cx+Math.cos(ang)*r0,cy+Math.sin(ang)*r0);ctx.lineTo(cx+Math.cos(ang)*r2,cy+Math.sin(ang)*r2);ctx.stroke();}}
  else if(vizMode===2){ctx.save();ctx.shadowColor=a2;ctx.shadowBlur=8;ctx.strokeStyle=hexA(a2,.45);ctx.lineWidth=5;ctx.beginPath();for(var i=0;i<512;i++){var x=i/512*cw,y=ch/2+td[i]*(ch*.43);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();ctx.restore();var g=ctx.createLinearGradient(0,0,cw,0);g.addColorStop(0,a1);g.addColorStop(.5,a2);g.addColorStop(1,a1);ctx.strokeStyle=g;ctx.lineWidth=2;ctx.beginPath();for(var i=0;i<512;i++){var x=i/512*cw,y=ch/2+td[i]*(ch*.43);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
  else if(vizMode===3){for(var i=0;i<64;i++){var v=f[Math.floor(i*128/64)],bh=v*ch*.47,x=i*(cw/64)+cw/64*.14,bw=cw/64*.72;var g=ctx.createLinearGradient(0,ch/2-bh,0,ch/2);g.addColorStop(0,'#fffae0');g.addColorStop(1,a1);ctx.fillStyle=g;ctx.fillRect(x,ch/2-bh,bw,bh);var g2=ctx.createLinearGradient(0,ch/2,0,ch/2+bh*.6);g2.addColorStop(0,hexA(a2,.45));g2.addColorStop(1,hexA(a1,.03));ctx.fillStyle=g2;ctx.fillRect(x,ch/2,bw,bh*.6);}ctx.strokeStyle=hexA(a2,.3);ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,ch/2);ctx.lineTo(cw,ch/2);ctx.stroke();}
  else if(vizMode===4){var cx=cw/2,cy=ch/2,r3=Math.min(cw,ch)*.38;ctx.save();ctx.translate(cx,cy);ctx.rotate(elapsed*.25);for(var s=0;s<12;s++){var ang=s/12*Math.PI*2,v=f[Math.floor(s*128/12)],ri=r3*.28,ro=r3*(0.35+v*.72),a1a=ang-Math.PI/12;ctx.beginPath();ctx.moveTo(Math.cos(a1a)*ri,Math.sin(a1a)*ri);ctx.lineTo(Math.cos(ang)*ro,Math.sin(ang)*ro);ctx.lineTo(Math.cos(ang+Math.PI/12)*ri,Math.sin(ang+Math.PI/12)*ri);ctx.closePath();var br=0.4+v*.6;ctx.fillStyle='rgba('+Math.round(200*br)+','+Math.round(150*br)+',42,'+(0.55+v*.45)+')';ctx.fill();}ctx.restore();}
  else if(vizMode===5){var cols=20,rows=7,cw5=cw/cols,ch5=ch/rows;for(var row=0;row<rows;row++)for(var col=0;col<cols;col++){var v=f[Math.floor((col/cols)*128)],active=(rows-row)/rows<v;ctx.fillStyle=active?'rgba('+Math.round(200*(rows-row)/rows)+','+Math.round(144*(rows-row)/rows)+',42,'+(0.6+(rows-row)/rows*.4)+')':'rgba(26,29,36,0.6)';ctx.fillRect(col*cw5+1,row*ch5+1,cw5-2,ch5-2);}}
  else if(vizMode===6){var avg=0;for(var i=0;i<20;i++)avg+=f[i];avg/=20;rainD.forEach(function(d){d.y+=d.spd*(1+avg*4);d.x+=Math.sin(elapsed+d.y*.02)*.35;if(d.y>dH+d.len){d.y=-d.len;d.x=Math.random()*dW;}var g=ctx.createLinearGradient(d.x,d.y-d.len,d.x,d.y);g.addColorStop(0,hexA(a2,0));g.addColorStop(1,hexA(a2,d.al*(0.5+avg*.5)));ctx.strokeStyle=g;ctx.lineWidth=1+avg*1.5;ctx.beginPath();ctx.moveTo(d.x,d.y-d.len);ctx.lineTo(d.x,d.y);ctx.stroke();});for(var i=0;i<128;i++){var v=f[i];ctx.fillStyle=hexA(a1,v*.22);ctx.fillRect(i/128*dW,dH-v*32,dW/128*.7,v*32);}}
  else if(vizMode===7){var avg=0;for(var i=0;i<30;i++)avg+=f[i];avg/=30;vizP.forEach(function(p,idx){var v=f[Math.floor(idx/vizP.length*128)];p.vx+=(Math.random()-.5)*.12;p.vy+=(Math.random()-.5)*.12-avg*.25;p.vx*=.97;p.vy*=.97;p.x+=p.vx*(1+avg*3);p.y+=p.vy*(1+avg*2);if(p.x<0)p.x=dW;if(p.x>dW)p.x=0;if(p.y<0)p.y=dH;if(p.y>dH)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1+v*2.5),0,Math.PI*2);ctx.fillStyle='rgba('+Math.round(200+55*v)+','+Math.round(144+80*v)+',42,'+(p.al*(0.3+v*.7))+')';ctx.fill();});}
  else if(vizMode===8){var cx=cw/2,cy=ch/2,spkR=Math.min(cw,ch)*.37,bass=0;for(var i=0;i<8;i++)bass+=f[i];bass/=8;var mid=0;for(var i=8;i<40;i++)mid+=f[i];mid/=32;ctx.strokeStyle=hexA(a1,0.35+bass*0.45);ctx.lineWidth=3+bass*5;ctx.beginPath();ctx.arc(cx,cy,spkR,0,Math.PI*2);ctx.stroke();for(var r=0;r<4;r++){var rb=bass*(1-r/3)+mid*(r/3);ctx.strokeStyle=hexA(a2,(0.12+rb*0.3)*(1-r/4));ctx.lineWidth=1.5-r*.2;ctx.beginPath();ctx.arc(cx,cy,spkR*(0.86-r*.11),0,Math.PI*2);ctx.stroke();}ctx.fillStyle=hexA(a1,0.12+bass*0.22);ctx.beginPath();ctx.arc(cx,cy,spkR*(0.3+bass*0.12),0,Math.PI*2);ctx.fill();ctx.fillStyle=hexA(a2,0.7+bass*0.25);ctx.beginPath();ctx.arc(cx,cy,spkR*0.09*(1+bass*0.5),0,Math.PI*2);ctx.fill();for(var i=0;i<48;i++){var ang=i/48*Math.PI*2,fv=f[Math.floor(i*128/48)]/255;ctx.strokeStyle='rgba('+Math.round(200+55*fv)+','+Math.round(130+80*fv)+',30,'+(0.25+fv*.65)+')';ctx.lineWidth=1.5+fv*2.5;ctx.beginPath();ctx.moveTo(cx+Math.cos(ang)*spkR*.96,cy+Math.sin(ang)*spkR*.96);ctx.lineTo(cx+Math.cos(ang)*spkR*(1.04+fv*.38),cy+Math.sin(ang)*spkR*(1.04+fv*.38));ctx.stroke();}}
  ctx.restore();
}

// ── VU METER ──────────────────────────────────────────────
var vuL=-40,vuR=-40;
(function vuLoop(){
  requestAnimationFrame(vuLoop);
  if(isPlaying&&analyser){var fd=new Uint8Array(analyser.frequencyBinCount);analyser.getByteFrequencyData(fd);var al=0,ar=0;for(var i=0;i<Math.floor(fd.length/2);i++)al+=fd[i];for(var i=Math.floor(fd.length/2);i<fd.length;i++)ar+=fd[i];al/=fd.length/2;ar/=fd.length/2;vuL+=((-45+(al/255)*48+(Math.random()-.5)*6)-vuL)*.25;vuR+=((-45+(ar/255)*48+(Math.random()-.5)*6)-vuR)*.25;}
  else{vuL+=((-40)-vuL)*.08;vuR+=((-40)-vuR)*.08;}
  vuL=Math.max(-45,Math.min(3,vuL));vuR=Math.max(-45,Math.min(3,vuR));
  var aL=((vuL+45)/48)*70-35,aR=((vuR+45)/48)*70-35;
  var nl=document.getElementById('vuL'),nr=document.getElementById('vuR');
  var dl=document.getElementById('dbL'),dr=document.getElementById('dbR');
  if(nl)nl.style.transform='translateX(-50%) rotate('+aL+'deg)';
  if(nr)nr.style.transform='translateX(-50%) rotate('+aR+'deg)';
  if(dl)dl.textContent=vuL.toFixed(1)+' dB';if(dr)dr.textContent=vuR.toFixed(1)+' dB';
}());

// ── MAIN LOOP ─────────────────────────────────────────────
var t0=performance.now();
(function mainLoop(){
  requestAnimationFrame(mainLoop);
  var elapsed=(performance.now()-t0)/1000;
  var fd=null,tdd=null;
  if(analyser&&isPlaying){fd=new Uint8Array(analyser.frequencyBinCount);tdd=new Uint8Array(analyser.fftSize);analyser.getByteFrequencyData(fd);analyser.getByteTimeDomainData(tdd);}
  drawViz(fd,tdd,elapsed);
  var t=curTrack();if(!t)return;
  var e2=0,total=0;
  if(t.type==='video'){if(!videoEl.duration)return;e2=videoEl.currentTime;total=videoEl.duration;}
  else{if(!audioBuf||!audioCtx)return;e2=isPlaying?(audioCtx.currentTime-startedAt):pausedAt;total=audioBuf.duration;}
  e2=Math.max(0,Math.min(e2,total));
  document.getElementById('progFill').style.width=(e2/total*100)+'%';
  document.getElementById('cur').textContent=fmt(e2);
}());

// ── SEEK ──────────────────────────────────────────────────
(function(){
  var pw=document.getElementById('progWrap');if(!pw)return;
  var dragging=false;
  function seekTo(clientX){var t=curTrack();if(!t)return;var rect=pw.getBoundingClientRect();var pct=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));if(t.type==='video'){if(videoEl.duration)videoEl.currentTime=pct*videoEl.duration;}else{if(!audioBuf)return;pausedAt=pct*audioBuf.duration;document.getElementById('progFill').style.width=(pct*100)+'%';document.getElementById('cur').textContent=fmt(pausedAt);if(isPlaying){if(srcNode){srcNode.onended=null;try{srcNode.stop();}catch(e){}try{srcNode.disconnect();}catch(e){}srcNode=null;}startAudioFrom(pausedAt);}}}
  pw.addEventListener('mousedown',function(e){dragging=true;seekTo(e.clientX);e.preventDefault();});
  document.addEventListener('mousemove',function(e){if(dragging)seekTo(e.clientX);});
  document.addEventListener('mouseup',function(){dragging=false;});
}());

// ── EQ ────────────────────────────────────────────────────
(function(){
  var cont=document.getElementById('eqBars');if(!cont)return;
  EQ_LABELS.forEach(function(lbl,i){
    var col=document.createElement('div');col.className='eq-col';
    var val=document.createElement('div');val.className='eq-val';val.id='eqv'+i;val.textContent='0dB';
    var sl=document.createElement('input');sl.type='range';sl.className='eq-sl';sl.min=-12;sl.max=12;sl.step=1;sl.value=0;
    sl.addEventListener('input',function(){var v=parseInt(this.value,10);document.getElementById('eqv'+i).textContent=(v>=0?'+':'')+v+'dB';if(eqFilters[i])eqFilters[i].gain.value=v;});
    var lb=document.createElement('div');lb.className='eq-freq';lb.textContent=lbl;
    col.appendChild(val);col.appendChild(sl);col.appendChild(lb);cont.appendChild(col);
  });
}());
var EQ_PRESETS={flat:[0,0,0,0,0,0,0,0,0,0],bass:[8,6,4,2,0,0,0,0,0,0],treble:[0,0,0,0,0,2,4,6,7,8],vocal:[-2,-1,0,2,4,4,3,1,0,-1],rock:[5,4,2,0,-1,0,2,4,5,6],pop:[-1,2,4,4,2,0,-1,-1,-1,-1],jazz:[3,2,1,2,0,0,1,2,3,2],classical:[4,3,2,1,0,0,0,2,3,4]};
var ep=document.getElementById('eqPreset');if(ep)ep.addEventListener('change',function(){var p=EQ_PRESETS[this.value];if(!p)return;document.querySelectorAll('.eq-sl').forEach(function(sl,i){sl.value=p[i];sl.dispatchEvent(new Event('input'));});});

// ── KNOBS ─────────────────────────────────────────────────
function setupKnob(id,valId,min,max,onChange){
  var knob=document.getElementById(id);if(!knob)return;
  var valEl=document.getElementById(valId);
  var curVal=parseInt(knob.dataset.val,10)||Math.round((min+max)/2);
  var startY,startVal;
  function update(v){curVal=Math.max(min,Math.min(max,v));knob.dataset.val=curVal;var pct=(curVal-min)/(max-min);var dot=knob.querySelector('.knob-dot');if(dot)dot.style.transform='translateX(-50%) rotate('+((pct*270)-135)+'deg)';if(valEl)valEl.textContent=id==='volKnob'?curVal:((curVal>=50?'+':'')+((curVal-50)*(12/50)).toFixed(0));if(onChange)onChange(curVal);}
  update(curVal);
  knob.addEventListener('mousedown',function(e){startY=e.clientY;startVal=curVal;e.preventDefault();});
  document.addEventListener('mousemove',function(e){if(startY===undefined)return;update(Math.round(startVal+(startY-e.clientY)*((max-min)/120)));});
  document.addEventListener('mouseup',function(){startY=undefined;});
}
setupKnob('volKnob','volVal',0,100,function(v){var sl=document.getElementById('volSl');if(sl)sl.value=v;var vp=document.getElementById('vpct');if(vp)vp.textContent=v+'%';if(gainNode)gainNode.gain.value=v/100;videoEl.volume=v/100;});
setupKnob('bassKnob','bassVal',0,100,function(v){if(eqFilters[0])eqFilters[0].gain.value=(v-50)*(12/50);});
setupKnob('midKnob','midVal',0,100,function(v){if(eqFilters[4])eqFilters[4].gain.value=(v-50)*(12/50);});
setupKnob('trebleKnob','trebleVal',0,100,function(v){if(eqFilters[9])eqFilters[9].gain.value=(v-50)*(12/50);});
var vsl=document.getElementById('volSl');if(vsl)vsl.addEventListener('input',function(){var v=parseInt(this.value,10);var vp=document.getElementById('vpct');if(vp)vp.textContent=v+'%';if(gainNode)gainNode.gain.value=v/100;videoEl.volume=v/100;});

// ── PLAYLIST ──────────────────────────────────────────────
function deleteTrack(origIdx){
  var t=tracks[origIdx];if(!t)return;
  tracks.splice(origIdx,1);
  if(curIdx>=tracks.length)curIdx=Math.max(0,tracks.length-1);
  else if(origIdx<curIdx)curIdx--;
  metaSave();updateInfo();renderPL();
  if(!tracks.length){stopAll();audioBuf=null;document.getElementById('tname').textContent='ยังไม่ได้เลือกไฟล์';document.getElementById('artBadge').className='art-badge';noMsg.style.display='flex';}
  else if(origIdx<=curIdx)play(tracks[curIdx].id,curIdx);
}
function moveToTop(origIdx){if(origIdx===0)return;var t=tracks.splice(origIdx,1)[0];tracks.unshift(t);if(origIdx===curIdx)curIdx=0;else if(origIdx>curIdx)curIdx++;metaSave();renderPL();}
function renderPL(){
  var pl=document.getElementById('plList');if(!pl)return;
  var cnt=document.getElementById('plCount');if(cnt)cnt.textContent=tracks.length?'('+tracks.length+')':'';
  var list=[];for(var i=0;i<tracks.length;i++){tracks[i]._i=i;if(plFilter==='all'||tracks[i].type===plFilter)list.push(tracks[i]);}
  if(!list.length){pl.innerHTML='<div class="pl-empty">'+(plFilter==='all'?'ลากไฟล์มาวาง หรือกด + เพิ่ม':'ไม่มีไฟล์ประเภทนี้')+'</div>';return;}
  pl.innerHTML='';
  list.forEach(function(t,fi){
    var el=document.createElement('div');el.className='pl-item'+(t._i===curIdx?' active':'');
    var num=document.createElement('span');num.className='pl-num';num.textContent=fi+1;
    var badge=document.createElement('span');badge.className='pl-badge '+(t.type==='video'?'video':'audio');badge.textContent=t.type==='video'?'MP4':'MP3';
    var nm=document.createElement('span');nm.className='pl-name';nm.title=t.name;nm.textContent=t.name;
    var dur=document.createElement('span');dur.className='pl-dur';dur.textContent=t.durStr;
    var ic=document.createElement('span');ic.className='pl-ic';ic.textContent=isPlaying?'▶':'⏸';ic.style.display=t._i===curIdx?'inline':'none';
    var topBtn=document.createElement('button');topBtn.className='pl-act-btn pl-top';topBtn.title='ย้ายมาอันดับ 1';topBtn.textContent='⬆';topBtn.style.display=t._i===0?'none':'inline-flex';
    topBtn.addEventListener('click',function(e){e.stopPropagation();moveToTop(t._i);});
    var delBtn=document.createElement('button');delBtn.className='pl-act-btn pl-del';delBtn.title='ลบออก';delBtn.textContent='✕';
    delBtn.addEventListener('click',function(e){e.stopPropagation();deleteTrack(t._i);});
    el.appendChild(num);el.appendChild(badge);el.appendChild(nm);el.appendChild(dur);el.appendChild(ic);el.appendChild(topBtn);el.appendChild(delBtn);
    el.addEventListener('click',function(){curIdx=t._i;metaSave();play(t.id,t._i);});
    pl.appendChild(el);
  });
}
document.querySelectorAll('.fbtn').forEach(function(btn){btn.addEventListener('click',function(){plFilter=this.dataset.f;document.querySelectorAll('.fbtn').forEach(function(b){b.classList.remove('active');});this.classList.add('active');renderPL();});});
document.querySelectorAll('.vbtn').forEach(function(btn){btn.addEventListener('click',function(){vizMode=parseInt(this.dataset.v,10);localStorage.setItem('sm_vizMode',vizMode);document.querySelectorAll('.vbtn').forEach(function(b){b.classList.remove('active');});this.classList.add('active');});});
(function(){document.querySelectorAll('.vbtn').forEach(function(b){b.classList.toggle('active',parseInt(b.dataset.v)===vizMode);});})();

// ── CONTROLS ──────────────────────────────────────────────
document.getElementById('btnPlay').addEventListener('click',togglePlay);
document.getElementById('btnNext').addEventListener('click',function(){if(!tracks.length)return;curIdx=doShuffle?Math.floor(Math.random()*tracks.length):(curIdx+1)%tracks.length;metaSave();play(tracks[curIdx].id,curIdx);});
document.getElementById('btnPrev').addEventListener('click',function(){if(!tracks.length)return;var t=curTrack(),pos=0;if(t&&t.type==='video')pos=videoEl.currentTime;else if(audioCtx)pos=isPlaying?(audioCtx.currentTime-startedAt):pausedAt;if(pos>3){if(t&&t.type==='video')videoEl.currentTime=0;else{pausedAt=0;if(isPlaying)startAudioFrom(0);}}else{curIdx=(curIdx-1+tracks.length)%tracks.length;metaSave();play(tracks[curIdx].id,curIdx);}});
document.getElementById('btnShuffle').addEventListener('click',function(){doShuffle=!doShuffle;this.classList.toggle('on',doShuffle);});
document.getElementById('btnRepeat').addEventListener('click',function(){doRepeat=!doRepeat;this.classList.toggle('on',doRepeat);});
document.getElementById('clearBtn').addEventListener('click',function(){if(!confirm('ล้าง playlist ทั้งหมด?'))return;stopAll();audioBuf=null;tracks=[];curIdx=0;videoEl.src='';document.getElementById('tname').textContent='ยังไม่ได้เลือกไฟล์';document.getElementById('cur').textContent='0:00';document.getElementById('tot').textContent='0:00';document.getElementById('progFill').style.width='0%';document.getElementById('artBadge').className='art-badge';noMsg.style.display='flex';localStorage.removeItem(META_KEY);updateInfo();renderPL();});
document.getElementById('addBtn').addEventListener('click',openFileDialog);
var addInline=document.getElementById('addBtnInline');if(addInline)addInline.addEventListener('click',openFileDialog);

// ── DRAG & DROP ───────────────────────────────────────────
var ACCEPT_EXT=/\.(mp3|mp4|wav|ogg|flac|aac|m4a|webm|mkv|mov|avi|wma|opus)$/i;
var dragCount=0;
document.addEventListener('dragenter',function(e){if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragCount++;document.body.classList.add('drag-over');});
document.addEventListener('dragleave',function(e){dragCount--;if(dragCount<=0){dragCount=0;document.body.classList.remove('drag-over');}});
document.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='copy';});
document.addEventListener('drop',function(e){
  e.preventDefault();dragCount=0;document.body.classList.remove('drag-over');
  var items=e.dataTransfer.items;
  var paths=[];
  if(items){
    for(var i=0;i<items.length;i++){
      var entry=items[i].webkitGetAsEntry&&items[i].webkitGetAsEntry();
      if(entry&&entry.isFile){
        (function(en){en.file(function(f){if(ACCEPT_EXT.test(f.name)||f.type.match(/^(audio|video)\//)){paths.push(f.path||f.name);}if(paths.length)addFilePaths(paths);});})(entry);
      }
    }
  }
});

// ── FULLSCREEN ────────────────────────────────────────────
var fsTimer=null;
function isFS(){return!!(document.fullscreenElement||document.webkitFullscreenElement);}
function toggleFS(){if(isFS()){if(document.exitFullscreen)document.exitFullscreen();}else{if(videoWrap.requestFullscreen)videoWrap.requestFullscreen();}}
document.addEventListener('fullscreenchange',function(){var btn=document.getElementById('fsBtn');if(isFS()){if(btn)btn.textContent='✕';}else{if(btn)btn.textContent='⛶';}});
videoWrap.addEventListener('click',function(e){if(e.target.id==='fsBtn'||(e.target.closest&&e.target.closest('#fsBtn')))return;togglePlay();});
document.getElementById('fsBtn').addEventListener('click',function(e){e.stopPropagation();toggleFS();});
videoEl.addEventListener('play',function(){var el=document.getElementById('vidPI');if(el)el.textContent='⏸';});
videoEl.addEventListener('pause',function(){var el=document.getElementById('vidPI');if(el)el.textContent='▶';});

// ── INIT ──────────────────────────────────────────────────
(function init(){
  var saved=metaLoad();
  if(!saved||!saved.list||!saved.list.length){updateInfo();return;}
  tracks=saved.list; curIdx=Math.min(saved.idx||0,tracks.length-1);
  renderPL();updateInfo();
  var t=tracks[curIdx];
  if(t){document.getElementById('tname').textContent=t.name;document.getElementById('tot').textContent=t.durStr||'--:--';var b=document.getElementById('artBadge');b.textContent=t.type==='video'?'MP4':'MP3';b.className='art-badge show';noMsg.style.display='none';}
  setSave('✅ โหลด '+tracks.length+' เพลง',3000);
}());
