(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    score: $('score'), coins: $('coins'), best: $('best'), distance: $('distance'),
    intro: $('introOverlay'), pause: $('pauseOverlay'), over: $('overOverlay'),
    start: $('startButton'), resume: $('resumeButton'), retry: $('retryButton'),
    pauseBtn: $('pauseButton'), finalScore: $('finalScore'), finalCoins: $('finalCoins'),
    finalDistance: $('finalDistance'), toast: $('toast'), sound: $('soundButton')
  };
  const W = 960, F = 700, CAM = 8;
  let H = 540, HORIZON = 0.28 * H;
  const laneX = (lane) => (lane - 1.5) * 1.6;
  let dpr = 1, scaleX = 1, scaleY = 1;
  let state = 'intro', lane = 2, jump = 0, slide = 0, runTime = 0, distance = 0, coins = 0, score = 0;
  let speed = 19, elapsed = 0, spawnTimer = 0, objects = [], particles = [], best = Number(localStorage.getItem('neon-run-best') || 0);
  let lastFrame = 0, toastTimer = 0, audioCtx = null, soundOn = true, shake = 0;
  let pointerStart = null;
  ui.best.textContent = String(best).padStart(6, '0');

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    H = W * rect.height / rect.width;
    HORIZON = 0.28 * H;
    scaleX = canvas.width / W; scaleY = canvas.height / H;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  const project = (x, y, z) => {
    const k = F / (CAM + z);
    const verticalScale = Math.max(.85, (H - HORIZON - 70) / 271);
    return { x: W / 2 + x * k, y: HORIZON + (3.1 - y) * k * verticalScale, k };
  };
  const poly = (pts, fill, stroke, lineWidth = 1) => {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  };
  const line = (a, b, color, width = 1) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); };
  const roundedRect = (x,y,w,h,r,fill) => { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=fill; ctx.fill(); };

  function drawBackground() {
    // Keep the horizon, skyline and sunset proportional on tall phone screens.
    ctx.save();
    ctx.scale(1, H / 540);
    const sky = ctx.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, '#14243e'); sky.addColorStop(.42, '#526b83'); sky.addColorStop(.66, '#e78f81'); sky.addColorStop(1, '#f4b77e');
    ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);
    const sun = ctx.createRadialGradient(660,155,8,660,155,112);
    sun.addColorStop(0,'#ffe9b8cc'); sun.addColorStop(.22,'#ffb98a88'); sun.addColorStop(1,'#ffb98a00');
    ctx.fillStyle=sun;ctx.fillRect(520,25,280,260);
    ctx.fillStyle='#ffe1b3';ctx.beginPath();ctx.arc(660,155,22,0,Math.PI*2);ctx.fill();
    // distant hills and layered skyline
    poly([{x:0,y:232},{x:120,y:187},{x:220,y:227},{x:330,y:172},{x:470,y:232},{x:620,y:184},{x:780,y:223},{x:960,y:168},{x:960,y:315},{x:0,y:315}], '#435b6c');
    drawCityLayer(0, '#2f465c', 13, 135, 85, 0);
    drawCityLayer(1, '#233a52', 17, 162, 100, 19);
    drawCityLayer(2, '#1a304a', 22, 185, 122, 7);
    // low colored haze
    const haze=ctx.createLinearGradient(0,235,0,340);haze.addColorStop(0,'#ffd3a322');haze.addColorStop(1,'#ffd3a300');ctx.fillStyle=haze;ctx.fillRect(0,230,W,110);
    // distant embankments at the horizon; the foreground is covered by the track projection.
    poly([{x:0,y:270},{x:W/2-166,y:275},{x:W/2-250,y:333},{x:0,y:340}], '#263f43');
    poly([{x:W,y:270},{x:W/2+166,y:275},{x:W/2+250,y:333},{x:W,y:340}], '#263f43');
    ctx.restore();
  }
  function drawCityLayer(layer, color, count, base, maxH, offset) {
    const width=W/count;
    for(let i=0;i<count;i++){
      const x=i*width - (offset + ((distance*0.015) % width));
      const w=width*(.58+((i*17+layer*11)%37)/100);
      const h=32+((i*31+layer*19)%maxH);
      const y=base-h;
      ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
      // roof details and lit windows
      ctx.fillStyle=layer===2?'#31465b':'#536579';
      if(i%3===0)ctx.fillRect(x+w*.58,y-9,w*.12,9);
      for(let wy=y+10;wy<base-4;wy+=12){
        for(let wx=x+7;wx<x+w-5;wx+=12){
          if(((Math.floor(wx)+Math.floor(wy)+i*5)%7)<2){ctx.fillStyle=layer===2?'#f7bf79':'#d7a982';ctx.globalAlpha=.6;ctx.fillRect(wx,wy,3,4);ctx.globalAlpha=1;ctx.fillStyle=layer===2?'#31465b':'#536579';}
        }
      }
    }
  }

  function drawTrack() {
    // Sleeper shadows / tunnel-side ground strips
    for(let z=116;z>0;z-=5){
      const z2=Math.max(0,z-2.5), a=project(-3.2,0,z), b=project(3.2,0,z), c=project(3.2,0,z2), d=project(-3.2,0,z2);
      const band=(Math.floor((z+distance*.8)/5)%2)===0;
      poly([a,b,c,d], band?'#354657':'#2d4051');
    }
    // Rails and road bed trapezoid segments
    const roadColors=['#283847','#293a4a'];
    for(let z=116;z>0;z-=4){
      const z2=Math.max(0,z-4), col=roadColors[Math.floor((z+distance*.6)/4)%2];
      poly([project(-3.2,0,z),project(3.2,0,z),project(3.2,0,z2),project(-3.2,0,z2)],col);
    }
    // outer edge paint
    for(const x of [-3.2,3.2]){
      const a=project(x,0,112),b=project(x,0,0);line(a,b,'#d7a57b77',3);
    }
    // lane dashes and subtle lane guides
    for(const x of [-1.6,0,1.6]){
      const a=project(x,0,112), b=project(x,0,0);line(a,b,'#b7d1d033',1.2);
      for(let z=((distance*1.0)%13);z<112;z+=13){
        const p=project(x,0,z), q=project(x,0,Math.max(0,z-5));
        line(p,q,'#d8e6e744',Math.max(1,p.k*.025));
      }
    }
    // twin rails, sleepers and warm edge lights
    for(const x of [-2.95,-2.72,2.72,2.95]){
      const a=project(x,0,112), b=project(x,0,0);line(a,b,Math.abs(x)>2.8?'#d7c3a9':'#89939b',Math.abs(x)>2.8?2:3);
    }
    for(let z=((distance*1.1)%6);z<112;z+=6){
      const left=project(-3.12,0,z),right=project(3.12,0,z);
      line(left,right,'#a9b5b633',Math.max(.7,left.k*.025));
    }
    // nearby signal lamps
    for(const side of [-1,1]){
      const p=project(side*4.05,0,34);
      ctx.fillStyle='#253749';ctx.fillRect(p.x-3,p.y-96*p.k/87.5,6,96*p.k/87.5);
      ctx.fillStyle='#ff6c91';ctx.shadowColor='#ff6c91';ctx.shadowBlur=14;
      ctx.beginPath();ctx.arc(p.x,p.y-72*p.k/87.5,3.5*p.k/87.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
  }

  function drawCoin(obj) {
    const p=project(laneX(obj.lane), .95+Math.sin(runTime*5+obj.phase)*.07, obj.z);
    const r=Math.max(2, .28*p.k), spin=.32+Math.abs(Math.sin(runTime*7+obj.phase))*.68;
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(spin,1);
    ctx.shadowColor='#ffdf75';ctx.shadowBlur=14*p.k/87.5;
    ctx.fillStyle='#ffdc70';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='#fff3bd';ctx.lineWidth=Math.max(1,r*.14);ctx.beginPath();ctx.arc(0,0,r*.72,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#b17735';ctx.font=`bold ${Math.max(7,r*1.15)}px Outfit`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',0,1);
    ctx.restore();
  }

  function drawBox(laneId,z,width,height,baseColor,topColor,frontColor) {
    const x=laneX(laneId), half=width/2;
    const p1=project(x-half,0,z),p2=project(x+half,0,z),p3=project(x+half,height,z),p4=project(x-half,height,z);
    const dx=F/(CAM+z)*.12, dy=F/(CAM+z)*.13;
    poly([p4,p3,{x:p3.x+dx,y:p3.y-dy},{x:p4.x+dx,y:p4.y-dy}],topColor);
    poly([p2,{x:p2.x+dx,y:p2.y-dy},{x:p3.x+dx,y:p3.y-dy},p3],baseColor);
    poly([p1,p2,p3,p4],frontColor, '#fff0d02c', Math.max(.5,p1.k*.012));
    return {x:p1.x,y:p4.y,w:p2.x-p1.x,h:p1.y-p4.y};
  }
  function drawObstacle(obj) {
    if(obj.type==='barrier'){
      const b=drawBox(obj.lane,obj.z,1.22,.72,'#b84f4d','#ffbd6d','#ee805d');
      const bandH=Math.max(3,b.h*.18);ctx.save();ctx.beginPath();ctx.rect(b.x,b.y+b.h-bandH,b.w,bandH);ctx.clip();
      ctx.strokeStyle='#ffe5af';ctx.lineWidth=Math.max(2,b.w*.055);
      for(let i=-b.h;i<b.w+b.h;i+=b.w*.24){ctx.beginPath();ctx.moveTo(b.x+i,b.y+b.h);ctx.lineTo(b.x+i+b.h*.55,b.y+b.h-bandH);ctx.stroke();}ctx.restore();
      // glowing cap
      ctx.fillStyle='#ffd38a';ctx.fillRect(b.x,b.y+b.h*.18,b.w,Math.max(2,b.h*.035));
    } else if(obj.type==='beam'){
      const x=laneX(obj.lane), z=obj.z;
      const l=project(x-.66,1.17,z),r=project(x+.66,1.17,z),lt=project(x-.66,1.43,z),rt=project(x+.66,1.43,z);
      poly([lt,rt,r,l],'#d15d70','#ffd2a655',1);
      for(const side of [-1,1]){
        const a=project(x+side*.57,0,z),b=project(x+side*.57,1.45,z);
        line(a,b,'#8e5661',Math.max(3,a.k*.055));
        const c=project(x+side*.57,1.47,z);ctx.fillStyle='#ff9f91';ctx.beginPath();ctx.arc(c.x,c.y,Math.max(2,c.k*.035),0,Math.PI*2);ctx.fill();
      }
      const p=project(x,1.3,z);ctx.fillStyle='#fff0d4';ctx.font=`bold ${Math.max(6,p.k*.09)}px DM Mono`;ctx.textAlign='center';ctx.fillText('SLIDE',p.x,p.y-2);
    }else{
      const b=drawBox(obj.lane,obj.z,1.5,1.42,'#50717d','#9bd4c8','#477b83');
      // stylized express train face
      const sx=b.w*.14, sy=b.h*.17;
      roundedRect(b.x+sx,b.y+sy,b.w*.72,b.h*.32,Math.max(2,b.w*.035),'#20384b');
      ctx.fillStyle='#bdf7ed';ctx.globalAlpha=.8;
      ctx.fillRect(b.x+sx*1.35,b.y+sy*1.25,b.w*.23,b.h*.19);ctx.fillRect(b.x+b.w*.56,b.y+sy*1.25,b.w*.23,b.h*.19);ctx.globalAlpha=1;
      ctx.fillStyle='#f0b576';ctx.fillRect(b.x,b.y+b.h*.77,b.w,b.h*.08);
      ctx.fillStyle='#ffda78';ctx.shadowColor='#ffcf73';ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(b.x+b.w*.2,b.y+b.h*.87,Math.max(2,b.w*.045),0,Math.PI*2);ctx.arc(b.x+b.w*.8,b.y+b.h*.87,Math.max(2,b.w*.045),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
  }

  function drawObjects(){
    const sorted=objects.slice().sort((a,b)=>b.z-a.z);
    for(const o of sorted){if(o.z<118&&o.z>-4){if(o.type==='coin')drawCoin(o);else drawObstacle(o);}}
  }

  function drawCharacter(){
    const x=laneX(lane), base=project(x,0,0), lift=jump>0?Math.sin((1-jump/.88)*Math.PI)*.86:0;
    const slideFactor=slide>0?Math.max(0,1-slide/.72):0;
    const bob=jump>0?0:Math.abs(Math.sin(runTime*13))*.055;
    const s=base.k/87.5, cx=base.x, ground=base.y;
    // shadow
    ctx.save();ctx.globalAlpha=.34*(1-lift*.45);ctx.fillStyle='#091624';ctx.beginPath();ctx.ellipse(cx,ground+3,22*s*(1-lift*.18),7*s,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(cx,ground-lift*75*s);
    if(slideFactor>.05){
      ctx.rotate(-.08);ctx.fillStyle='#152a3a';roundedRect(-26*s,-25*s,54*s,27*s,12*s,'#f07983');
      roundedRect(-21*s,-22*s,37*s,18*s,8*s,'#5ee7e4');
      ctx.fillStyle='#efc49b';ctx.beginPath();ctx.arc(25*s,-20*s,10*s,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#e7ddcf';roundedRect(-20*s,-3*s,19*s,11*s,4*s,'#f3d9b8');roundedRect(3*s,-3*s,21*s,11*s,4*s,'#f3d9b8');
      ctx.restore();return;
    }
    const phase=runTime*13;
    // legs and bright trainers
    for(let side=-1;side<=1;side+=2){
      const swing=jump>0?0:Math.sin(phase+side*Math.PI)*.22;
      const hipX=side*7*s, kneeX=hipX+swing*24*s, footX=hipX+swing*38*s;
      line({x:hipX,y:-33*s},{x:kneeX,y:-18*s},'#23384b',8*s);
      line({x:kneeX,y:-18*s},{x:footX,y:-4*s},'#f0d7b6',6*s);
      roundedRect(footX-7*s,-5*s,15*s,7*s,3*s,side<0?'#5ee7e4':'#ff739e');
    }
    // jacket body
    ctx.fillStyle='#f37a82';ctx.beginPath();ctx.moveTo(-14*s,-59*s);ctx.quadraticCurveTo(-17*s,-40*s,-12*s,-30*s);ctx.lineTo(12*s,-30*s);ctx.quadraticCurveTo(18*s,-46*s,13*s,-59*s);ctx.closePath();ctx.fill();
    // teal chest stripe and zipper
    ctx.fillStyle='#5ee7e4';ctx.beginPath();ctx.moveTo(-6*s,-58*s);ctx.lineTo(2*s,-58*s);ctx.lineTo(7*s,-31*s);ctx.lineTo(-2*s,-31*s);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#ffe3b6';ctx.lineWidth=1.5*s;ctx.beginPath();ctx.moveTo(0,-54*s);ctx.lineTo(0,-36*s);ctx.stroke();
    // arms with alternating swing
    for(let side=-1;side<=1;side+=2){
      const swing=jump>0?-.2:Math.sin(phase+side*Math.PI)*.34;
      const shoulder={x:side*12*s,y:-55*s};
      const elbow={x:side*20*s+swing*8*s,y:-44*s+swing*16*s};
      const hand={x:side*18*s+swing*18*s,y:-34*s+swing*28*s};
      line(shoulder,elbow,'#f07982',7*s);line(elbow,hand,'#efc49b',6*s);
    }
    // neck and face
    ctx.fillStyle='#d99d7d';ctx.fillRect(-4*s,-67*s,8*s,11*s);
    ctx.fillStyle='#edc5a1';ctx.beginPath();ctx.ellipse(0,-76*s,12*s,14*s,0,0,Math.PI*2);ctx.fill();
    // hair cap, fringe and headband
    ctx.fillStyle='#293448';ctx.beginPath();ctx.arc(0,-80*s,13*s,Math.PI,Math.PI*2);ctx.lineTo(13*s,-76*s);ctx.quadraticCurveTo(7*s,-80*s,1*s,-74*s);ctx.lineTo(-11*s,-73*s);ctx.closePath();ctx.fill();
    ctx.fillStyle='#5ee7e4';ctx.fillRect(-11*s,-82*s,22*s,3.5*s);
    ctx.fillStyle='#28384a';ctx.beginPath();ctx.arc(4*s,-76*s,1*s,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawAtmosphere(){
    // speed streaks near edges
    ctx.save();ctx.globalAlpha=Math.min(.35,(speed-18)*.025);
    for(let i=0;i<8;i++){
      const y=((i*91+runTime*speed*12)%H);const side=i%2?1:-1;
      ctx.strokeStyle=i%2?'#ffbf9290':'#82e5e190';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(side<0?0:W,y);ctx.lineTo(side<0?70:W-70,y-12);ctx.stroke();
    }
    ctx.restore();
    // subtle vignette
    const v=ctx.createRadialGradient(W/2,H*.56,H*.2,W/2,H*.56,H*.83);
    v.addColorStop(.55,'#07132300');v.addColorStop(1,'#0713239e');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
  }

  function draw(){
    ctx.setTransform(scaleX,0,0,scaleY,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.save();
    if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);}
    drawBackground();drawTrack();drawObjects();drawCharacter();drawAtmosphere();
    ctx.restore();
  }

  function addParticle(x,y,color){
    for(let i=0;i<9;i++)particles.push({x,y,vx:(Math.random()-.5)*150,vy:(Math.random()-.8)*120,life:.45,color});
  }
  function updateParticles(dt){
    particles=particles.filter(p=>p.life>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;p.life-=dt;}
  }
  function paintParticles(){
    ctx.save();ctx.setTransform(scaleX,0,0,scaleY,0,0);
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/.45);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x/ W*W,p.y/ H*H,3,0,Math.PI*2);ctx.fill();}ctx.restore();
  }

  function spawnRow(){
    const z=91+Math.random()*8;
    const difficulty=Math.min(1,elapsed/75);
    const safe=lane;
    const obstacleLanes=[0,1,2,3].filter(i=>i!==safe);
    // Simple safe-lane tutorial rhythm, then more varied combinations.
    const count=difficulty<.18?1:(Math.random()<.48?2:1);
    const selected=[];
    while(selected.length<count){const i=obstacleLanes[Math.floor(Math.random()*obstacleLanes.length)];if(!selected.includes(i))selected.push(i);}
    selected.forEach((l,index)=>{
      let type;
      const roll=Math.random();
      if(elapsed<5)type='barrier';
      else if(roll<.42)type='barrier';else if(roll<.72)type='beam';else type='train';
      objects.push({type,lane:l,z:z+index*.8,passed:false});
    });
    // A readable coin line guides the safe opening.
    if(Math.random()<.8){
      const coinLane=safe;
      for(let j=0;j<5;j++)objects.push({type:'coin',lane:coinLane,z:z+13+j*3.4,phase:Math.random()*6});
    }
  }
  function startRun(){
    state='running';lane=2;jump=slide=runTime=distance=coins=score=elapsed=spawnTimer=0;speed=19;objects=[];particles=[];shake=0;
    if(window.innerWidth<=700&&window.innerHeight>window.innerWidth){lane=1;}
    ui.intro.classList.add('dismiss');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');ui.pauseBtn.classList.remove('hidden');
    updateHud();sound('start');setTimeout(()=>ui.intro.classList.add('hidden'),320);
    showToast('GO GET THAT GLOW');
  }
  function finishRun(){
    if(state!=='running')return;state='over';shake=11;ui.pauseBtn.classList.add('hidden');
    const final=Math.floor(score);ui.finalScore.textContent=String(final).padStart(6,'0');ui.finalCoins.textContent=String(coins);ui.finalDistance.textContent=`${Math.floor(distance)} m`;
    if(final>best){best=final;localStorage.setItem('neon-run-best',String(best));ui.best.textContent=String(best).padStart(6,'0');showToast('NEW PERSONAL BEST');}
    ui.over.classList.remove('hidden');sound('crash');
  }
  function togglePause(){
    if(state==='running'){state='paused';ui.pause.classList.remove('hidden');ui.pauseBtn.classList.add('hidden');}
    else if(state==='paused'){state='running';ui.pause.classList.add('hidden');ui.pauseBtn.classList.remove('hidden');lastFrame=performance.now();}
  }
  function updateHud(){ui.score.textContent=String(Math.floor(score)).padStart(6,'0');ui.coins.textContent=String(coins).padStart(2,'0');ui.distance.textContent=`${Math.floor(distance)} m`;}
  function showToast(message){ui.toast.textContent=message;ui.toast.classList.add('show');toastTimer=1.3;}

  function action(type){
    if(state!=='running')return;
    if(type==='left')lane=Math.max(0,lane-1);
    if(type==='right')lane=Math.min(3,lane+1);
    if(type==='jump'&&jump<=0&&slide<=0){jump=.88;sound('jump');}
    if(type==='slide'&&slide<=0&&jump<=0){slide=.72;sound('slide');}
  }
  function update(dt){
    if(state==='running'){
      elapsed+=dt;runTime+=dt;speed=Math.min(31,19+elapsed*.105);distance+=speed*dt*.69;score+=speed*dt*1.6;
      jump=Math.max(0,jump-dt);slide=Math.max(0,slide-dt);spawnTimer+=dt;
      if(spawnTimer>Math.max(.83,1.38-elapsed*.004)){spawnTimer=0;spawnRow();}
      for(const o of objects){o.z-=speed*dt;
        if(o.type==='coin'&&!o.passed&&o.z<1.8&&o.z>-.7){
          o.passed=true;if(o.lane===lane){coins++;score+=50;addParticle(project(laneX(lane),1,0).x,project(laneX(lane),1,0).y,'#ffdf75');sound('coin');if(coins%10===0)showToast('10 COINS — NICE!');}
        }else if(o.type!=='coin'&&!o.passed&&o.z<1.35&&o.z>-.3){
          o.passed=true;if(o.lane===lane){
            const cleared=(o.type==='barrier'&&jump>.11)||(o.type==='beam'&&slide>.08);
            if(!cleared){finishRun();break;}
            score+=30;
          }
        }
      }
      objects=objects.filter(o=>o.z>-8);
      updateHud();
    }
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}
    if(shake>0)shake=Math.max(0,shake-dt*28);
    updateParticles(dt);
  }
  function loop(now){
    const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;update(dt);draw();
    // Render collected sparkles above the scene.
    if(particles.length){ctx.setTransform(scaleX,0,0,scaleY,0,0);ctx.save();for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/.45);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fill();}ctx.restore();}
    requestAnimationFrame(loop);
  }

  function sound(kind){
    if(!soundOn)return;
    try{
      audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended')audioCtx.resume();
      const now=audioCtx.currentTime, osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
      osc.connect(gain);gain.connect(audioCtx.destination);
      const notes={coin:[760,1180],jump:[270,420],slide:[190,130],crash:[190,55],start:[430,650]};
      const n=notes[kind]||[400,600];osc.type=kind==='coin'?'sine':'triangle';osc.frequency.setValueAtTime(n[0],now);osc.frequency.exponentialRampToValueAtTime(n[1],now+.12);
      gain.gain.setValueAtTime(kind==='crash'?.12:.07,now);gain.gain.exponentialRampToValueAtTime(.001,now+.2);osc.start(now);osc.stop(now+.21);
    }catch(_){/* Audio is optional. */}
  }

  ui.start.addEventListener('click',startRun);ui.retry.addEventListener('click',startRun);$('restartPause').addEventListener('click',startRun);
  ui.resume.addEventListener('click',togglePause);ui.pauseBtn.addEventListener('click',togglePause);
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.sound.textContent=soundOn?'♫':'♩';ui.sound.style.color=soundOn?'':'#8c9bb0';if(soundOn)sound('coin');});
  document.querySelectorAll('.mobile-controls button').forEach(button=>{
    button.addEventListener('pointerdown',e=>{e.preventDefault();action(button.dataset.action);});
  });
  canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointerup',e=>{
    if(!pointerStart)return;const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))>24){if(Math.abs(dx)>Math.abs(dy))action(dx<0?'left':'right');else action(dy<0?'jump':'slide');}
    pointerStart=null;
  });
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();
    if(['arrowleft','arrowright','arrowup','arrowdown',' ','w','a','s','d'].includes(key))e.preventDefault();
    if(key==='arrowleft'||key==='a')action('left');if(key==='arrowright'||key==='d')action('right');
    if(key==='arrowup'||key==='w'||key===' ')action('jump');if(key==='arrowdown'||key==='s')action('slide');
    if((key==='p'||key==='escape')&&(state==='running'||state==='paused'))togglePause();
    if((key==='enter'||key===' ')&&state==='over')startRun();
    if((key==='enter'||key===' ')&&state==='intro')startRun();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='running')togglePause();});
  requestAnimationFrame(loop);
})();
