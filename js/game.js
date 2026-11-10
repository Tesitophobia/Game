(() => {
  'use strict';
  /* ==========================================================================
   GAME.JS / MOTOR DEL JUEGO
   1. Estado y referencias de interfaz
   2. Creación del edificio y reinicio de partida
   3. Movimiento, colisiones y reglas
   4. Renderizado (la ilustración de personajes vive en art.js)
   5. Entrada de teclado, menú y arranque
   ========================================================================== */
  const C = window.GAME_CONFIG, canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const $ = id => document.getElementById(id);
  const ui = {
    menu: $('menu'),
    hud: $('gameHud'),
    pause: $('pause'),
    result: $('result'),
    time: $('time'),
    timeBar: $('timeBar'),
    lives: $('lives'),
    helmet: $('helmet'),
    rescued: $('rescued'),
    floor: $('floorLabel'),
    floorBar: $('floorBar'),
    toast: $('toast'),
    toastText: $('toastText'),
    trainingGuide: $('trainingGuide'),
    trainingTitle: $('trainingTitle'),
    trainingText: $('trainingText')
  };
  let state = 'menu';
  let last = 0, raf = 0, selected = 'normal';
  let sound = true, audio = null, toastTimer = 0, lowTimeShown = false;
  let training = false, trainingStep = 0, trainingItemsCollected = {
    helmet: false, medkit: false
  };
  const keys= {
    left:false, right:false, jump:false, run:false, interact:false
  };
  let player, floors, hazards, items, civilians, floorHazards, particles;
  let timeLeft, lives, helmet, cameraY, shake, spawnClock, hits, rescued, elapsed, warning, lastFloor;
  const rand=(a, b)=>a+Math.random()*(b-a), clamp=(v, a, b)=>Math.max(a, Math.min(b, v));
  /* 02 — EDIFICIO, PISOS Y REINICIO */
  function floorTop(i) {
    return 170+i*C.building.floorGap;
  }
  function stair(i) {
    return i%2===0? {
      x:760, w:C.building.stairWidth, dir: 'right'
    }
    : {
      x:50, w:C.building.stairWidth, dir: 'left'
    };
  }
  function floorCount() {
    return C.building.floorsByDifficulty[selected]||5;
  }
  function reset() {
    const d = C.difficulty[selected];
    timeLeft = d.time;
    lives = d.lives;
    helmet = 0;
    cameraY = 0;
    shake = 0;
    spawnClock = training ? 999 : 1;
    hits = 0;
    rescued = 0;
    elapsed = 0;
    warning = null;
    lastFloor = 0;
    lowTimeShown = false;
    trainingStep = 0;
    trainingItemsCollected = {
      helmet: false, medkit: false
    };
    const count=floorCount();floors=Array.from( {
      length:count
    }, (_, i)=>( {
      i, y:floorTop(i), stair:stair(i), name:C.building.floorNames[i%C.building.floorNames.length]
    }));
    player= {
      x:110, y:floorTop(0)-C.player.height, vx:0, vy:0, w:C.player.width, h:C.player.height, ground:true, face:1, anim:0, invuln:0, duck:false, rescueTarget:null, rescueProgress:0
    };
    hazards=[];items=[];particles=[];civilians=[];
    // Fixed, intentional placement: one civilian per selected floor and supplies along the route.
    const rescueFloors=[1, Math.max(1, Math.floor((count-1)*.55)), count-1].filter((v, i, a)=>v<count-1&&a.indexOf(v)===i);rescueFloors.forEach((f, n)=>civilians.push( {
      x:floors[f].stair.dir=== 'right'?620:310, y:floors[f].y-39, floor:f, done:false, progress:0, id:n
    }));
    for (let f = 1; f < count - 1; f++) {
      if (f % 3 === 1) items.push( {
        x: floors[f].stair.dir === 'right' ? 620 : 300, y: floors[f].y - 18, type: 'helmet', bob: rand(0, 6)
      });
      if (f % 4 === 2) items.push( {
        x: floors[f].stair.dir === 'right' ? 300 : 620, y: floors[f].y - 18, type: 'medkit', bob: 0
      });
    }
    if (training) {
      // En el entrenamiento se colocan ambos objetos para practicar su recogida.
      items.push( {
        x: 545, y: floors[1].y - 18, type: 'medkit', bob: 0
      });
    }
    floorHazards=[];floors.forEach((fl, i)=> {
      if(i===0||i===count-1)return;const amount=d.floorHazardCount;for(let n=0;n<amount;n++) {
        const x=170+n*260+(i%2?40:0);if(x+C.hazards.floorHazardWidth/2<fl.stair.x-8||x-C.hazards.floorHazardWidth/2>fl.stair.x+fl.stair.w+8)floorHazards.push( {
          x, y:fl.y-18, w:C.hazards.floorHazardWidth, type:(i+n)%3===0? 'fire':(i+n)%3===1? 'electric': 'rubble', active:true
        });
      }
    });
    if (training) {
      // El nivel de práctica muestra los tres peligros en una misma planta.
      const trainingFire = floorHazards.find(hazard => hazard.type === 'fire');
      if (trainingFire) trainingFire.x = 650;
      floorHazards.push({
        x: 300, y: floors[1].y - 18, w: 64, type: 'electric', active: true
      });
    }
    updateHud();
  }
  /* 02B — FLUJO DE PARTIDA Y ENTRENAMIENTO */
  function start() {
    training = false;
    selected = $('difficulty').value;
    beginGame();
  }
  function startTraining() {
    training = true;
    selected = 'tutorial';
    beginGame();
  }
  function beginGame() {
    document.getElementById('gameFrame').classList.add('touch-active');
    reset();
    state = 'playing';
    ui.menu.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    ui.pause.classList.add('hidden');
    ui.result.classList.add('hidden');
    ui.trainingGuide.classList.toggle('hidden', !training);
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function pause() {
    if(state=== 'playing') {
      state= 'paused';ui.pause.classList.remove('hidden');
    }
    else if(state=== 'paused') {
      state= 'playing';ui.pause.classList.add('hidden');last=performance.now();raf=requestAnimationFrame(loop);
    }
  }
  function end(win) {
    if(state!== 'playing')return;state=win? 'won': 'lost';$('resultEyebrow').textContent = training ? 'MÓDULO DE FORMACIÓN' : (win ? 'EVACUACIÓN COMPLETADA' : 'INFORME DE EMERGENCIA');
    $('resultTitle').textContent = training ? (win ? 'ENTRENAMIENTO COMPLETADO' : 'VUELVE A INTENTARLO') : (win ? 'LO LOGRASTE' : 'NO HUBO SALIDA');$('resultStats').innerHTML= `<div><small>PERSONAS AUXILIADAS</small><b>${rescued} / ${civilians.length}</b></div><div><small>IMPACTOS RECIBIDOS</small><b>${hits}</b></div><div><small>TIEMPO RESTANTE</small><b>${formatTime(timeLeft)}</b></div><div><small>DIFICULTAD</small><b>${C.difficulty[selected].label}</b></div>`;ui.result.classList.remove('hidden');
  }
  function formatTime(t) {
    t=Math.max(0, Math.ceil(t));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  }
  function notify(msg, type= 'info') {
    ui.toastText.textContent=msg;ui.toast.className= `toast ${type}`;ui.toast.querySelector('.toast-mark').textContent=type=== 'success'? '✓':type=== 'danger'? '!':type=== 'warning'? '⚠': '·';clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.add('hidden'), 2300);
  }
  // Sonidos sintetizados: no necesita archivos de audio externos.
  function playTone(frequency, duration = 0.09, delay = 0, volume = 0.035) {
    if (!sound) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!audio) audio = new AudioContext();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const startAt = audio.currentTime + delay;
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(volume, startAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration);
    } catch (_) { /* El juego sigue funcionando aunque el navegador bloquee el audio. */ }
  }
  function playSfx(name) {
    const patterns = {
      jump: [[420, .07, 0], [620, .06, .055]],
      pickup: [[520, .07, 0], [780, .09, .07]],
      rescue: [[440, .1, 0], [554, .1, .1], [659, .16, .2]],
      damage: [[180, .13, 0], [110, .18, .09]],
      warning: [[300, .08, 0], [300, .08, .18]]
    };
    (patterns[name] || []).forEach(([frequency, duration, delay]) => playTone(frequency, duration, delay));
  }
  function floorIndex() {
    return clamp(Math.floor((player.y+player.h-floorTop(0)+1)/C.building.floorGap), 0, Math.max(0, floors.length-1));
  }
  /* 03 — ACTUALIZACIÓN: MOVIMIENTO, COLISIONES Y REGLAS */
  function update(dt) {
    elapsed+=dt;timeLeft-=dt;if(!training&&timeLeft<=20&&!lowTimeShown) {
      lowTimeShown=true;notify('ALERTA — QUEDAN 20 SEGUNDOS PARA EL COLAPSO', 'warning');playSfx('warning');
    }
    if(timeLeft<=0) {
      timeLeft=0;end(false);return;
    }
    const p=player, d=C.difficulty[selected];p.invuln=Math.max(0, p.invuln-dt);helmet=Math.max(0, helmet-dt);
    const moving=(keys.right?1:0)-(keys.left?1:0);if(training&&moving!==0)trainingStep=Math.max(trainingStep, 1);const wantsDuck=keys.duck&&!keys.run;if(wantsDuck&&!p.duck) {
      p.y+=16;p.h=32;
    }
    else if(!wantsDuck&&p.duck) {
      p.y-=16;p.h=C.player.height;
    }
    p.duck=wantsDuck;p.vx=moving*C.player.speed*(keys.run?C.player.runMultiplier:1)*(p.duck?.55:1);if(moving)p.face=Math.sign(moving);p.x=clamp(p.x+p.vx*dt, 24, C.building.roomWidth-24-p.w);
    if(keys.jump&&p.ground&&!p.duck) {
      if(training)trainingStep=Math.max(trainingStep, 2);p.vy=-C.player.jumpForce;p.ground=false;keys.jump=false;playSfx('jump');burst(p.x+p.w/2, p.y+p.h, 7, '#e4b45e');
    }
    p.vy=Math.min(C.player.maxFall, p.vy+C.player.gravity*dt);const prevBottom=p.y+p.h;p.y+=p.vy*dt;p.ground=false;
    const fi=floorIndex(), f=floors[fi], st=f.stair, overlaps=p.x+p.w>st.x&&p.x<st.x+st.w;
    // A solid floor except for the stairwell opening. The next floor catches the player below.
    if(!overlaps&&p.vy>=0&&prevBottom<=f.y+5&&p.y+p.h>=f.y) {
      p.y=f.y-p.h;p.vy=0;p.ground=true;
    }
    if(overlaps&&p.y+p.h>=f.y-4&&p.y+p.h<f.y+80) {
      p.vy=Math.max(p.vy, 110);
    }
    // Land on the next floor after dropping through the stair opening.
    const next=floors[fi+1];if(next&&p.vy>=0&&p.y+p.h>=next.y&&p.y+p.h<next.y+45) {
      const ns=next.stair;const overNext=p.x+p.w>ns.x&&p.x<ns.x+ns.w;if(!overNext) {
        p.y=next.y-p.h;p.vy=0;p.ground=true;
      }
    }
    if(p.y>floorTop(floors.length-1)+360) {
      end(false);return;
    }
    // Camera follows the descending player, with restrained earthquake shake.
    const target=clamp(p.y-300, 0, floorTop(floors.length-1)-180);cameraY+=(target-cameraY)*Math.min(1, dt*C.camera.followEase);
    if(Math.random()<dt*1.8)shake=Math.max(shake, rand(1, 3));shake=Math.max(0, shake-dt*13);
    const current = floorIndex();
    if (training && current >= 1 && trainingStep >= 2) trainingStep = Math.max(trainingStep, 3);
    if (training && trainingItemsCollected.helmet && trainingItemsCollected.medkit) trainingStep = Math.max(trainingStep, 4);
    if (training && trainingStep >= 3 && civilians.some(c => !c.done && Math.abs((p.x + p.w / 2) - c.x) < C.rescue.distance * 1.6 && Math.abs((p.y + p.h) - c.y) < 90)) trainingStep = Math.max(trainingStep, 4);
    if (training && rescued > 0) trainingStep = Math.max(trainingStep, 5);
    if (training && current === floors.length - 1) trainingStep = Math.max(trainingStep, 5);if(current>lastFloor) {
      lastFloor=current;notify(`HAS LLEGADO AL PISO ${String(floors.length-current).padStart(2,'0')} · ${floors[current].name}`, 'info');
    }
    // Hazards: warning marker first, then falling debris with visible trajectory.
    spawnClock-=dt;if(spawnClock<=0&&hazards.length<C.hazards.maxActive) {
      const x=clamp(p.x+rand(-230, 230), 80, 870);hazards.push( {
        x, y:cameraY+rand(-70, 20), vy:d.hazardSpeed, w:rand(18, 34), h:rand(16, 27), warning:C.hazards.warningTime, hit:false, rot:rand(-.2, .2)
      });spawnClock=rand(d.hazardRate*.65, d.hazardRate*1.35);
    }
    hazards.forEach(h=> {
      if(h.warning>0) {
        h.warning-=dt;return;
      }
      h.y+=h.vy*dt;h.rot+=dt*1.8;if(!h.hit&&p.invuln<=0&&rect(p.x+4, p.y+5, p.w-8, p.h-7, h.x-h.w/2, h.y-h.h/2, h.w, h.h)) {
        h.hit=true;damage();
      }
      if(h.y>p.y+p.h+25&&!h.hit&&Math.random()<dt*3)burst(h.x, h.y, 2, '#aab0ad');
    });
    hazards=hazards.filter(h=>h.y<cameraY+740&&!h.hit);
    // Floor hazards are fixed to the architecture: jump over fire/rubble, avoid exposed live cables.
    floorHazards.forEach(h=> {
      if(!h.active)return;const hy=h.y-cameraY;if(rect(p.x+5, p.y+8, p.w-10, p.h-8, h.x-h.w/2, h.y-18, h.w, 24)&&p.invuln<=0) {
        h.active=false;damage();
      }
    });
    // Pickups.
    items.forEach(it=> {
      it.bob+=dt*3;if(rect(p.x, p.y, p.w, p.h, it.x-13, it.y-18+Math.sin(it.bob)*3, 26, 30)) {
        if(it.type=== 'helmet') {
          helmet=C.helmet.duration;notify('CASCO EQUIPADO · ABSORBE EL PRÓXIMO IMPACTO', 'success');playSfx('pickup');
        }
        else {
          lives=Math.min(d.lives, lives+1);notify('BOTIQUÍN RECOGIDO · HAS RECUPERADO UNA VIDA', 'success');playSfx('pickup');
        }
        if (training) {
          trainingItemsCollected[it.type] = true;
          if (trainingItemsCollected.helmet && trainingItemsCollected.medkit) trainingStep = Math.max(trainingStep, 4);
        }
        it.got=true;burst(it.x, it.y, 12, '#e4b45e');
      }
    });items=items.filter(i=>!i.got);
    // Rescue: hold E while close; movement is reduced while helping.
    const person=civilians.find(c=>!c.done&&Math.abs((p.x+p.w/2)-c.x)<C.rescue.distance&&Math.abs((p.y+p.h)-c.y)<75);
    if(person&&keys.interact) {
      p.vx=0;person.progress+=dt;if(person.progress>=d.rescueTime) {
        person.done=true;rescued++;if(training)trainingStep=Math.max(trainingStep, 5);timeLeft+=C.rescue.bonusSeconds;notify(`PERSONA AUXILIADA · +${C.rescue.bonusSeconds} SEGUNDOS`, 'success');playSfx('rescue');burst(person.x, person.y, 18, '#91b8a2');
      }
    }
    else if(person)person.progress=Math.max(0, person.progress-dt*1.6);
    civilians.forEach(c=> {
      if(c.done)c.y+=0;
    });
    // Exit at ground level.
    if(current===floors.length-1&&p.y+p.h>=floors[floors.length-1].y-2&&p.x>760) {
      end(true);return;
    }
    p.anim+=dt*Math.abs(p.vx)*.035;updateHud();
  }
  function rect(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;
  }
  function damage() {
    player.invuln=C.player.invulnerability;if(helmet>0) {
      helmet=0;notify('IMPACTO BLOQUEADO · EL CASCO SE HA ROTO', 'warning');playSfx('damage');burst(player.x, player.y, 15, '#e4b45e');
    }
    else {
      lives=Math.max(0, lives-C.hazards.debrisDamage);hits++;player.invuln=C.player.invulnerability;player.vy=-180;shake=8;notify(`VIDA PERDIDA · TE ${lives===1?'QUEDA':'QUEDAN'} ${lives}`, 'danger');playSfx('damage');burst(player.x, player.y, 16, '#d96b50');if(lives<=0)end(false);
    }
  }
  function burst(x, y, n, color) {
    for(let i=0;i<n;i++)particles.push( {
      x, y, vx:rand(-120, 120), vy:rand(-160, 80), life:rand(.25, .7), max:.7, color, size:rand(2, 5)
    });
  }
  function updateHud() {
    ui.time.textContent = formatTime(timeLeft);
    ui.timeBar.style.width = `${clamp(timeLeft / C.difficulty[selected].time * 100, 0, 100)}%`;
    ui.lives.textContent = Array.from( {
      length: C.difficulty[selected].lives
    }, (_, i) => i < lives ? '♥' : '·').join(' ');
    ui.helmet.textContent = helmet > 0 ? `ACTIVO · ${helmet.toFixed(0)}s` : 'NO EQUIPADO';
    ui.helmet.classList.toggle('active', helmet > 0);
    ui.rescued.innerHTML = `${String(rescued).padStart(2, '0')} <span>/ ${String(civilians.length).padStart(2, '0')}</span>`;
    const fi = floorIndex();
    ui.floor.textContent = `PISO 0${floors.length - fi} / ${floors.length}`;
    ui.floorBar.style.width = `${(fi / Math.max(1, floors.length - 1)) * 100}%`;
    if (training) {
      const guide = [
      ['01 / MUÉVETE', 'Usa A y D para caminar. Busca el hueco de las escaleras.'],
      ['02 / SALTA', 'Pulsa ESPACIO para saltar. SHIFT te permite correr.'],
      ['03 / IDENTIFICA PELIGROS', 'Fuego, cables expuestos y escombros hacen daño. Salta o cambia tu ruta.'],
      ['04 / EQUÍPATE', 'El casco bloquea un impacto. El botiquín recupera una vida. Recógelos.'],
      ['05 / AUXILIA', 'Acércate a la persona y mantén E. Cada rescate suma 7 segundos.'],
      ['06 / ENCUENTRA LA SALIDA', 'Desciende hasta la planta baja y alcanza la puerta de salida.']
      ];
      const step = guide[Math.min(trainingStep, guide.length - 1)];
      ui.trainingTitle.textContent = step[0];
      ui.trainingText.textContent = step[1];
    }
  }
  /* 04 — RENDERIZADO DEL EDIFICIO Y SUS ELEMENTOS */
  function draw() {
    const W=canvas.width, H=canvas.height;ctx.save();ctx.clearRect(0, 0, W, H);if(shake>0)ctx.translate(rand(-shake, shake), rand(-shake, shake));drawBackdrop(W, H);floors.forEach(drawFloor);drawFloorHazards();drawItems();drawCivilians();drawHazards();drawPlayer();drawParticles();drawOverlayText();ctx.restore();
  }
  function drawBackdrop(W, H) {
    const g=ctx.createLinearGradient(0, 0, 0, H);g.addColorStop(0, '#15232e');g.addColorStop(1, '#080e15');ctx.fillStyle=g;ctx.fillRect(0, 0, W, H); // exterior skyline
    for(let i=0;i<13;i++) {
      let x=i*82-(cameraY*.05%82);ctx.fillStyle=i%2? '#1c303d': '#203542';ctx.fillRect(x, 0, 50, H);for(let y=35;y<H;y+=76) {
        ctx.fillStyle=(i+y)%3? '#d49a55': '#547985';ctx.fillRect(x+12, y, 8, 13);ctx.fillRect(x+30, y, 8, 13);
      }
    }
    ctx.fillStyle= '#101a23';ctx.fillRect(0, 0, 26, H);ctx.fillRect(934, 0, 26, H);
  }
  function drawFloor(f) {
    const y=Math.round(f.y-cameraY);if(y<-90||y>640)return;const st=f.stair;
    // Concrete shell: deep shadow, plaster, brick courses and reinforced pillars.
    ctx.fillStyle= '#17232c';ctx.fillRect(26, y-C.building.roomHeight, 908, C.building.roomHeight);
    ctx.fillStyle=f.i%2? '#34434a': '#3b4a50';ctx.fillRect(44, y-C.building.roomHeight+12, 872, C.building.roomHeight-46);
    ctx.fillStyle= '#59666a';ctx.fillRect(26, y-C.building.roomHeight, 22, C.building.roomHeight);ctx.fillRect(912, y-C.building.roomHeight, 22, C.building.roomHeight);
    ctx.fillStyle= '#8b9290';ctx.fillRect(29, y-C.building.roomHeight, 5, C.building.roomHeight);ctx.fillRect(916, y-C.building.roomHeight, 4, C.building.roomHeight);
    ctx.fillStyle= '#26343b';ctx.fillRect(48, y-C.building.roomHeight+9, 864, 11);ctx.fillRect(48, y-37, 864, 13);
    // Brick / plaster texture, carefully aligned to the pixel grid.
    ctx.fillStyle= '#48565a';for(let yy=y-C.building.roomHeight+30;yy<y-48;yy+=27) {
      for(let xx=55+(Math.floor(yy/27)%2)*19;xx<906;xx+=76)ctx.fillRect(xx, yy, 29, 2);
    }
    ctx.fillStyle= '#667276';for(let x=55;x<900;x+=170) {
      ctx.fillRect(x, y-232, 112, 5);ctx.fillRect(x, y-91, 112, 5);
    }
    // Tall windows with exterior city depth, mullions, sill and reflections.
    for(let x=62;x<900;x+=170) {
      ctx.fillStyle= '#101a22';ctx.fillRect(x-4, y-211, 120, 124);ctx.fillStyle= '#243e50';ctx.fillRect(x, y-207, 112, 116);
      ctx.fillStyle= '#31596b';ctx.fillRect(x+5, y-201, 102, 103);ctx.fillStyle= '#1b3546';ctx.fillRect(x+8, y-196, 96, 94);
      ctx.fillStyle= '#557b88';ctx.fillRect(x+52, y-207, 4, 116);ctx.fillRect(x, y-151, 112, 4);
      ctx.fillStyle= '#91a8a5';ctx.fillRect(x+8, y-198, 38, 3);ctx.fillRect(x+8, y-198, 3, 35);
      ctx.fillStyle= '#d7a45f';ctx.fillRect(x+13, y-184, 6, 8);ctx.fillRect(x+83, y-132, 5, 7);
      ctx.fillStyle= '#172b39';ctx.fillRect(x+7, y-112, 98, 10);
    }
    // Room dividers, door frames, skirting and ceiling light fixtures.
    ctx.fillStyle= '#1a272e';ctx.fillRect(316, y-179, 13, 143);ctx.fillRect(610, y-179, 13, 143);
    ctx.fillStyle= '#748084';ctx.fillRect(319, y-179, 3, 143);ctx.fillRect(613, y-179, 3, 143);
    ctx.fillStyle= '#a18b68';ctx.fillRect(348, y-119, 54, 85);ctx.fillStyle= '#19252d';ctx.fillRect(353, y-114, 44, 80);ctx.fillStyle= '#d8b36d';ctx.fillRect(389, y-77, 4, 4);
    ctx.fillStyle= '#d5c18b';for(let x=110;x<870;x+=250) {
      ctx.fillRect(x, y-228, 58, 4);ctx.fillStyle= '#fff0bd';ctx.fillRect(x+4, y-224, 50, 3);ctx.fillStyle= '#d5c18b';
    }
    // Structural slab and the real stairwell opening.
    ctx.fillStyle= '#111b24';ctx.fillRect(26, y, st.x-26, 23);ctx.fillRect(st.x+st.w, y, 934-(st.x+st.w), 23);
    ctx.fillStyle= '#7b898b';ctx.fillRect(26, y, st.x-26, 4);ctx.fillRect(st.x+st.w, y, 934-st.x-st.w, 4);
    ctx.fillStyle= '#080e14';ctx.fillRect(st.x, y, st.w, 24);ctx.fillStyle= '#d6a45e';ctx.fillRect(st.x+8, y-9, st.w-16, 3);
    ctx.fillStyle= '#d7e2e2';ctx.font= 'bold 11px monospace';ctx.fillText('▼ ESCALERAS', st.x+22, y-17);
    // Stair flight with risers, handrails and landing.
    ctx.fillStyle= '#45545a';ctx.fillRect(st.x+5, y+20, st.w-10, 8);
    for(let step=0;step<7;step++) {
      const sx=st.dir=== 'right'?st.x+12+step*17:st.x+st.w-25-step*17;const sy=y+8+step*7;ctx.fillStyle= '#293941';ctx.fillRect(sx, sy+4, 24, 5);ctx.fillStyle= '#9aa09a';ctx.fillRect(sx, sy, 24, 3);ctx.fillStyle= '#59676b';ctx.fillRect(sx+2, sy+3, 20, 2);
    }
    ctx.strokeStyle= '#a9b1a8';ctx.lineWidth=2;ctx.beginPath();if(st.dir=== 'right') {
      ctx.moveTo(st.x+12, y-4);ctx.lineTo(st.x+128, y+48);
    }
    else {
      ctx.moveTo(st.x+130, y-4);ctx.lineTo(st.x+14, y+48);
    }
    ctx.stroke();
    // Distinct room dressing, damage decals and floor number signage.
    drawPixelDetail(f, y);drawRoomProps(f, y);drawRoomPropsDetails(f, y);drawRoomAccents(f, y);
    ctx.fillStyle= '#202b32';ctx.fillRect(54, y-226, 124, 18);ctx.fillStyle= '#d7d4c8';ctx.font= 'bold 11px monospace';ctx.fillText(`PISO 0${floors.length-f.i}  /  ${f.name}`, 60, y-213);
    ctx.fillStyle= '#d96b50';ctx.fillRect(886, y-224, 22, 9);ctx.fillStyle= '#ffcf9c';ctx.fillRect(890, y-222, 5, 4);ctx.fillStyle= '#6b2825';ctx.fillRect(883, y-214, 28, 2);
    // Concrete cracks with branching fractures and exposed rebar.
    ctx.strokeStyle= '#b0a99a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(280, y-232);ctx.lineTo(269, y-208);ctx.lineTo(283, y-194);ctx.lineTo(270, y-176);ctx.lineTo(277, y-159);ctx.stroke();ctx.beginPath();ctx.moveTo(269, y-208);ctx.lineTo(253, y-214);ctx.lineTo(246, y-205);ctx.stroke();
    ctx.fillStyle= '#8e5b4d';ctx.fillRect(267, y-178, 3, 17);ctx.fillRect(272, y-174, 3, 13);
    // Bottom-floor exit vestibule.
    if(f.i===floors.length-1) {
      ctx.fillStyle= '#101b22';ctx.fillRect(775, y-83, 132, 83);ctx.fillStyle= '#d96b50';ctx.fillRect(786, y-72, 110, 72);ctx.fillStyle= '#d8e0d9';ctx.fillRect(795, y-63, 92, 63);ctx.fillStyle= '#20323b';ctx.fillRect(837, y-63, 4, 63);ctx.fillStyle= '#d8b36d';ctx.fillRect(827, y-32, 5, 5);ctx.fillStyle= '#101820';ctx.font= 'bold 15px monospace';ctx.fillText('SALIDA', 809, y-39);ctx.fillStyle= '#d96b50';ctx.fillRect(815, y-91, 56, 7);
    }
  }
  function drawRoomProps(f, y) {
    const theme=f.i%6;
    if(theme===0) {
      // Office: workstation, monitors, chair and filing cabinet.
      for(let x=90;x<850;x+=270) {
        ctx.fillStyle= '#654d3c';ctx.fillRect(x, y-75, 166, 9);ctx.fillStyle= '#34434a';ctx.fillRect(x+8, y-66, 7, 66);ctx.fillRect(x+151, y-66, 7, 66);ctx.fillStyle= '#18252d';ctx.fillRect(x+42, y-112, 54, 35);ctx.fillStyle= '#537b84';ctx.fillRect(x+46, y-108, 46, 26);ctx.fillStyle= '#9ab0a7';ctx.fillRect(x+49, y-105, 25, 3);ctx.fillStyle= '#283a43';ctx.fillRect(x+58, y-77, 22, 3);ctx.fillStyle= '#171f27';ctx.fillRect(x+110, y-62, 27, 48);ctx.fillRect(x+106, y-68, 35, 8);ctx.fillStyle= '#b18a60';ctx.fillRect(x+12, y-15, 10, 15);ctx.fillRect(x+143, y-15, 10, 15);
      }
      ctx.fillStyle= '#59636a';ctx.fillRect(800, y-132, 58, 118);ctx.fillStyle= '#b0a18a';for(let k=0;k<5;k++)ctx.fillRect(806, y-119+k*20, 46, 3);
    }
    else if(theme===1) {
      // Apartments: sofa, lamp, plant, framed picture.
      ctx.fillStyle= '#765a4b';ctx.fillRect(105, y-62, 190, 42);ctx.fillRect(96, y-73, 24, 55);ctx.fillRect(280, y-73, 24, 55);ctx.fillStyle= '#b99a7d';ctx.fillRect(112, y-77, 176, 17);ctx.fillStyle= '#d6c4a4';ctx.fillRect(125, y-72, 46, 10);ctx.fillRect(180, y-72, 46, 10);
      ctx.fillStyle= '#6a5542';ctx.fillRect(410, y-105, 62, 68);ctx.fillStyle= '#b6a27e';ctx.fillRect(416, y-99, 50, 56);ctx.fillStyle= '#52727a';ctx.fillRect(422, y-92, 38, 42);
      ctx.fillStyle= '#6b4d39';ctx.fillRect(535, y-78, 8, 62);ctx.fillStyle= '#d9b56f';ctx.fillRect(521, y-119, 36, 42);ctx.fillStyle= '#fff0b5';ctx.fillRect(527, y-113, 24, 30);
      ctx.fillStyle= '#735b42';ctx.fillRect(735, y-35, 40, 20);ctx.fillStyle= '#42664f';ctx.fillRect(744, y-75, 24, 40);ctx.fillRect(736, y-61, 40, 15);ctx.fillStyle= '#a3a66d';ctx.fillRect(750, y-83, 10, 10);
    }
    else if(theme===2) {
      // Archive: shelving, boxes and labelled binders.
      for(let x=80;x<860;x+=190) {
        ctx.fillStyle= '#26363d';ctx.fillRect(x, y-145, 132, 145);ctx.fillStyle= '#8a806d';ctx.fillRect(x+5, y-139, 122, 5);ctx.fillRect(x+5, y-94, 122, 5);ctx.fillRect(x+5, y-49, 122, 5);for(let k=0;k<5;k++) {
          ctx.fillStyle=['#8d6e54', '#657b80', '#9a8b70'][k%3];ctx.fillRect(x+10+k*22, y-132, 16, 36);ctx.fillRect(x+10+k*22, y-87, 16, 36);ctx.fillRect(x+10+k*22, y-42, 16, 36);ctx.fillStyle= '#d6c7a5';ctx.fillRect(x+13+k*22, y-122, 10, 3);
        }
      }
    }
    else if(theme===3) {
      // Small shop: counter, display shelves and hanging sign.
      ctx.fillStyle= '#765a43';ctx.fillRect(95, y-77, 245, 15);ctx.fillRect(110, y-62, 15, 62);ctx.fillRect(310, y-62, 15, 62);ctx.fillStyle= '#263b45';ctx.fillRect(122, y-139, 195, 55);ctx.fillStyle= '#8a9a91';for(let k=0;k<4;k++) {
        ctx.fillRect(132+k*44, y-130, 28, 34);ctx.fillStyle= '#d6a45e';ctx.fillRect(136+k*44, y-124, 20, 4);ctx.fillStyle= '#8a9a91';
      }
      ctx.fillStyle= '#d96b50';ctx.fillRect(530, y-180, 112, 28);ctx.fillStyle= '#f0dfb8';ctx.font= 'bold 13px monospace';ctx.fillText('ABIERTO', 545, y-161);ctx.fillStyle= '#354a50';ctx.fillRect(690, y-90, 112, 90);
    }
    else if(theme===4) {
      // Clinic: examination bed, cabinet and medical cross.
      ctx.fillStyle= '#d2d1c2';ctx.fillRect(105, y-64, 225, 15);ctx.fillStyle= '#687b7c';ctx.fillRect(118, y-49, 10, 49);ctx.fillRect(307, y-49, 10, 49);ctx.fillStyle= '#e5dfcb';ctx.fillRect(118, y-77, 85, 13);ctx.fillStyle= '#a9b4ad';ctx.fillRect(520, y-132, 102, 132);ctx.fillStyle= '#526b72';ctx.fillRect(530, y-122, 82, 112);ctx.fillStyle= '#d96b50';ctx.fillRect(560, y-111, 22, 6);ctx.fillRect(568, y-119, 6, 22);ctx.fillStyle= '#6a7c7b';ctx.fillRect(730, y-90, 90, 90);ctx.fillStyle= '#e0d6be';ctx.fillRect(740, y-80, 70, 70);
    }
    else {
      // Lobby / reception: reception desk, plant, mailboxes.
      ctx.fillStyle= '#3a5057';ctx.fillRect(90, y-104, 240, 104);ctx.fillStyle= '#d96b50';ctx.fillRect(110, y-128, 200, 24);ctx.fillStyle= '#e9dfca';ctx.font= 'bold 14px monospace';ctx.fillText('RECEPCIÓN', 142, y-111);ctx.fillStyle= '#b6a47c';ctx.fillRect(490, y-155, 130, 85);ctx.fillStyle= '#26343c';ctx.fillRect(500, y-145, 110, 65);for(let k=0;k<6;k++) {
        ctx.fillStyle= '#87969a';ctx.fillRect(510+(k%3)*31, y-135+Math.floor(k/3)*25, 23, 17);
      }
      ctx.fillStyle= '#42664f';ctx.fillRect(760, y-90, 30, 90);ctx.fillRect(745, y-75, 60, 15);ctx.fillStyle= '#9aa66d';ctx.fillRect(750, y-105, 45, 18);
    }
    // Shared details: wall clock, notice board, radiator, skirting and scattered masonry.
    ctx.fillStyle= '#17232b';ctx.fillRect(670, y-218, 76, 58);ctx.fillStyle= '#9b927c';ctx.fillRect(675, y-213, 66, 48);ctx.fillStyle= '#273a43';ctx.fillRect(680, y-208, 56, 38);ctx.fillStyle= '#e4b45e';ctx.fillRect(707, y-198, 3, 17);ctx.fillRect(707, y-198, 13, 3);
    ctx.fillStyle= '#6d7775';ctx.fillRect(360, y-27, 116, 9);for(let x=370;x<470;x+=18) {
      ctx.fillStyle= '#b0aaa0';ctx.fillRect(x, y-24, 9, 3);
    }
    if(f.i%2===1) {
      ctx.fillStyle= '#667078';ctx.fillRect(650, y-18, 28, 18);ctx.fillRect(680, y-11, 34, 11);ctx.fillStyle= '#8b8172';ctx.fillRect(700, y-23, 16, 12);ctx.fillStyle= '#b2a38d';ctx.fillRect(664, y-21, 7, 4);
    }
    // Exposed cable run and junction box add architectural scale.
    ctx.fillStyle= '#202b31';ctx.fillRect(48, y-190, 5, 86);ctx.fillRect(48, y-190, 85, 4);ctx.fillStyle= '#d4a65f';ctx.fillRect(47, y-111, 7, 8);ctx.fillStyle= '#9b6550';ctx.fillRect(52, y-111, 4, 17);
  }
  function drawRoomPropsDetails(f, y) {
    // Detalles pequeños que hacen reconocibles los materiales y la escala.
    const theme = f.i % 6;

    if (theme === 0) {
      // Oficinas: teclados, documentos, lámparas, ruedas y cables de escritorio.
      for (let x = 90; x < 850; x += 270) {
        ctx.fillStyle = '#17232b';
        ctx.fillRect(x + 43, y - 74, 51, 5);
        ctx.fillStyle = '#9aa7a0';
        for (let k = 0; k < 8; k++) ctx.fillRect(x + 46 + k * 5, y - 73, 2, 2);
        ctx.fillStyle = '#d8c8a5';
        ctx.fillRect(x + 12, y - 83, 24, 2);
        ctx.fillRect(x + 14, y - 80, 19, 2);
        ctx.fillStyle = '#7c8e8d';
        ctx.fillRect(x + 118, y - 80, 4, 5);
        ctx.fillRect(x + 116, y - 75, 8, 2);
        ctx.fillStyle = '#26353b';
        ctx.fillRect(x + 119, y - 13, 4, 8);
        ctx.fillRect(x + 109, y - 7, 23, 3);
        ctx.fillStyle = '#91a9a8';
        ctx.fillRect(x + 47, y - 107, 7, 2);
        ctx.fillRect(x + 80, y - 102, 9, 2);
        ctx.strokeStyle = '#17252d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 126, y - 14);
        ctx.lineTo(x + 133, y - 3);
        ctx.lineTo(x + 148, y - 3);
        ctx.stroke();
      }
    } else if (theme === 1) {
      // Apartamentos: costuras del sofá, cojines, mesa, taza y hojas de planta.
      ctx.fillStyle = '#493b36';
      ctx.fillRect(111, y - 42, 178, 2);
      ctx.fillRect(201, y - 72, 2, 13);
      ctx.fillStyle = '#d6c4a4';
      ctx.fillRect(130, y - 70, 38, 2);
      ctx.fillRect(184, y - 70, 36, 2);
      ctx.fillStyle = '#e7d8b7';
      ctx.fillRect(145, y - 68, 3, 6);
      ctx.fillRect(199, y - 68, 3, 6);
      ctx.fillStyle = '#6c4e3e';
      ctx.fillRect(356, y - 25, 114, 7);
      ctx.fillStyle = '#b89b76';
      ctx.fillRect(360, y - 24, 106, 2);
      ctx.fillStyle = '#d9d2bd';
      ctx.fillRect(390, y - 34, 9, 9);
      ctx.fillStyle = '#8a6a51';
      ctx.fillRect(392, y - 36, 5, 3);
      ctx.fillStyle = '#42664f';
      ctx.fillRect(741, y - 82, 7, 14);
      ctx.fillRect(756, y - 88, 7, 18);
      ctx.fillRect(769, y - 77, 7, 12);
      ctx.fillStyle = '#a3a66d';
      ctx.fillRect(744, y - 87, 4, 4);
      ctx.fillRect(762, y - 94, 4, 4);
      ctx.fillRect(772, y - 84, 4, 4);
    } else if (theme === 2) {
      // Archivo: etiquetas de archivadores, esquinas de cartón y sombras.
      for (let x = 80; x < 860; x += 190) {
        for (let row = 0; row < 3; row++) {
          for (let k = 0; k < 5; k++) {
            const bx = x + 10 + k * 22;
            const by = y - 132 + row * 45;
            ctx.fillStyle = '#27343a';
            ctx.fillRect(bx + 2, by + 29, 11, 2);
            ctx.fillStyle = '#e0d2b2';
            ctx.fillRect(bx + 3, by + 7, 9, 5);
            ctx.fillStyle = '#9b8a69';
            ctx.fillRect(bx + 4, by + 8, 6, 1);
          }
        }
        ctx.fillStyle = '#c0a77d';
        ctx.fillRect(x + 4, y - 140, 7, 2);
        ctx.fillRect(x + 115, y - 95, 7, 2);
      }
    } else if (theme === 3) {
      // Comercio: etiquetas, frascos, productos y cristales de vitrina.
      for (let shelf = 0; shelf < 3; shelf++) {
        for (let k = 0; k < 5; k++) {
          const px = 130 + k * 35;
          const py = y - 130 + shelf * 15;
          ctx.fillStyle = ['#a96a4e', '#6f8b83', '#d2b26c'][k % 3];
          ctx.fillRect(px, py, 10, 10);
          ctx.fillStyle = '#f0dfb8';
          ctx.fillRect(px + 2, py + 2, 6, 2);
          ctx.fillStyle = '#283940';
          ctx.fillRect(px + 4, py + 7, 3, 1);
        }
      }
      ctx.fillStyle = '#e6d9b8';
      ctx.fillRect(540, y - 174, 7, 3);
      ctx.fillRect(552, y - 174, 7, 3);
      ctx.fillRect(564, y - 174, 7, 3);
      ctx.fillStyle = '#27363c';
      ctx.fillRect(699, y - 85, 4, 72);
      ctx.fillRect(798, y - 85, 4, 72);
    } else if (theme === 4) {
      // Consultorios: pliegues de camilla, monitor, trazo y suero.
      ctx.fillStyle = '#f0ebd9';
      ctx.fillRect(126, y - 63, 176, 3);
      ctx.fillRect(140, y - 57, 150, 2);
      ctx.fillStyle = '#9ab5ae';
      ctx.fillRect(538, y - 116, 66, 2);
      ctx.fillRect(538, y - 110, 66, 2);
      ctx.strokeStyle = '#8fc4b7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(540, y - 102);
      ctx.lineTo(550, y - 102);
      ctx.lineTo(555, y - 111);
      ctx.lineTo(562, y - 93);
      ctx.lineTo(569, y - 102);
      ctx.lineTo(603, y - 102);
      ctx.stroke();
      ctx.fillStyle = '#9bc4a6';
      ctx.fillRect(672, y - 174, 16, 26);
      ctx.fillRect(675, y - 180, 10, 7);
      ctx.fillStyle = '#e9e2ca';
      ctx.fillRect(677, y - 170, 6, 15);
      ctx.fillStyle = '#354b50';
      ctx.fillRect(746, y - 70, 5, 3);
      ctx.fillRect(792, y - 70, 5, 3);
    } else {
      // Recepción: borde del mostrador, pantalla, teclado y casilleros.
      ctx.fillStyle = '#91a5a0';
      ctx.fillRect(113, y - 102, 190, 3);
      ctx.fillStyle = '#18252d';
      ctx.fillRect(185, y - 136, 64, 35);
      ctx.fillStyle = '#557e88';
      ctx.fillRect(190, y - 131, 54, 25);
      ctx.fillStyle = '#9bb8b4';
      ctx.fillRect(194, y - 128, 25, 2);
      ctx.fillStyle = '#c6b99d';
      for (let k = 0; k < 7; k++) ctx.fillRect(355 + k * 11, y - 30, 7, 3);
      ctx.fillStyle = '#d7c49b';
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(710, y - 138 + k * 24, 74, 3);
        ctx.fillStyle = '#526970';
        ctx.fillRect(714, y - 133 + k * 24, 65, 15);
        ctx.fillStyle = '#d7c49b';
      }
      ctx.fillStyle = '#416b55';
      ctx.fillRect(836, y - 73, 8, 42);
      ctx.fillRect(826, y - 61, 29, 10);
      ctx.fillRect(831, y - 83, 17, 12);
    }
  }

  function drawRoomAccents(f, y) {
    // Fine environmental storytelling: exit signage, fire equipment, wall sockets,
    // radiators, hanging lamps, ceiling pipes, papers and small broken details.
    const room=f.i%6;
    // A continuous conduit run and exposed junction points reinforce the building scale.
    ctx.fillStyle= '#17252d';ctx.fillRect(48, y-202, 864, 3);ctx.fillStyle= '#8a9995';ctx.fillRect(48, y-201, 864, 1);
    [150, 455, 770].forEach((x, i)=> {
      ctx.fillStyle= '#202d34';ctx.fillRect(x, y-212, 19, 17);ctx.fillStyle= '#667a7e';ctx.fillRect(x+2, y-210, 15, 12);
      ctx.fillStyle=i===1? '#d96b50': '#e9bd70';ctx.fillRect(x+6, y-207, 7, 3);ctx.fillRect(x+8, y-203, 3, 3);
    });
    // Emergency route placards and wall-mounted extinguisher.
    ctx.fillStyle= '#173b35';ctx.fillRect(832, y-184, 54, 17);ctx.fillStyle= '#9bc4a6';ctx.fillRect(837, y-180, 14, 9);ctx.fillStyle= '#e4eee1';ctx.font= 'bold 8px monospace';ctx.fillText('RUTA', 855, y-172);
    ctx.fillStyle= '#17232b';ctx.fillRect(73, y-102, 13, 37);ctx.fillStyle= '#b94f42';ctx.fillRect(76, y-100, 8, 31);ctx.fillStyle= '#e6d7b5';ctx.fillRect(77, y-95, 6, 2);ctx.fillRect(78, y-91, 4, 2);ctx.fillStyle= '#8c9996';ctx.fillRect(81, y-104, 3, 5);
    // Ceiling pipework with brackets and a damaged section that leaks dust/water.
    ctx.fillStyle= '#18262e';ctx.fillRect(350, y-229, 3, 28);ctx.fillRect(350, y-229, 145, 4);ctx.fillStyle= '#6c7b7e';ctx.fillRect(353, y-228, 137, 2);
    [380, 440, 485].forEach(x=> {
      ctx.fillStyle= '#9aa09a';ctx.fillRect(x, y-231, 3, 7);
    });
    if(f.i%2===0) {
      ctx.fillStyle= '#3c5962';ctx.fillRect(489, y-226, 9, 7);ctx.fillStyle= '#83b7c0';ctx.fillRect(492, y-218, 2, 5);ctx.fillStyle= '#83b7c055';ctx.fillRect(490, y-212, 7, 2);
    }
    // Wall lamps cast stepped amber pools rather than smooth gradients.
    [245, 690].forEach((x, i)=> {
      ctx.fillStyle= '#1b2830';ctx.fillRect(x, y-225, 42, 10);ctx.fillStyle= '#9c8c6b';ctx.fillRect(x+4, y-223, 34, 5);
      ctx.fillStyle= '#f2d89a';ctx.fillRect(x+9, y-221, 24, 2);
      ctx.fillStyle= '#b58a4d22';ctx.fillRect(x+5, y-214, 32, 3);ctx.fillRect(x+10, y-211, 22, 2);
    });
    // Floor-level sockets, skirting damage and papers add a lived-in scale cue.
    [205, 570, 865].forEach((x, i)=> {
      ctx.fillStyle= '#18252c';ctx.fillRect(x, y-48, 12, 10);ctx.fillStyle= '#a5aaa0';ctx.fillRect(x+2, y-46, 8, 6);
      ctx.fillStyle= '#293c43';ctx.fillRect(x+4, y-44, 2, 3);ctx.fillRect(x+8, y-44, 2, 3);
    });
    if(room===0||room===2||room===3) {
      for(let i=0;i<3;i++) {
        const x=365+i*24;ctx.fillStyle= '#c6b99d';ctx.fillRect(x, y-7-i%2*2, 13, 2);ctx.fillStyle= '#7d8a87';ctx.fillRect(x+2, y-5-i%2*2, 8, 1);
      }
    }
    // Cracked wall edge reveals masonry in alternating blocks.
    if(f.i%2===0) {
      ctx.fillStyle= '#27363b';ctx.fillRect(904, y-170, 8, 42);for(let i=0;i<5;i++) {
        ctx.fillStyle=i%2? '#8b8274': '#aa9b85';ctx.fillRect(905+(i%2)*3, y-166+i*8, 5, 3);
      }
    }
  }
  function drawPixelDetail(f, y) {
    // Additional hand-authored pixel clusters: chipped plaster, tile seams, conduit,
    // window reflections, furniture highlights and small debris. Stable per floor.
    const seed=(f.i+1)*9173;const pick=n=>((seed+n*73)%997)/997;
    // Wall plaster chips and damp stains, kept away from the room's main silhouettes.
    for(let n=0;n<34;n++) {
      const x=58+Math.floor(pick(n+2)*830), yy=y-48-Math.floor(pick(n+41)*158);
      const w=2+Math.floor(pick(n+80)*7), h=2+Math.floor(pick(n+120)*4);
      ctx.fillStyle=n%3===0? '#667174':n%3===1? '#293940': '#4c5b5e';ctx.fillRect(x, yy, w, h);
      if(n%4===0) {
        ctx.fillStyle= '#89918a';ctx.fillRect(x+1, yy+1, Math.max(1, w-3), 1);
      }
    }
    // Ceiling beam with alternating concrete highlights and dark underside.
    ctx.fillStyle= '#1c2930';ctx.fillRect(48, y-235, 864, 13);
    ctx.fillStyle= '#687477';ctx.fillRect(48, y-235, 864, 3);
    for(let x=60;x<900;x+=72) {
      ctx.fillStyle= '#526166';ctx.fillRect(x, y-232, 34, 2);ctx.fillStyle= '#26363d';ctx.fillRect(x+34, y-228, 18, 4);
    }
    // Window glass gets a city silhouette, reflected lights and diagonal glints.
    for(let x=64;x<900;x+=170) {
      ctx.fillStyle= '#182d3b';ctx.fillRect(x+7, y-151, 98, 48);
      for(let k=0;k<5;k++) {
        const bx=x+12+k*19, bh=8+Math.floor(pick(k+x)*25);ctx.fillStyle=k%2? '#294654': '#203b49';ctx.fillRect(bx, y-104-bh, 11, bh);ctx.fillStyle= '#d7a45f';ctx.fillRect(bx+3, y-100-bh, 2, 3);
      }
      ctx.fillStyle= '#7899a0';ctx.fillRect(x+12, y-194, 3, 29);ctx.fillRect(x+15, y-194, 24, 2);
      ctx.fillStyle= '#b8c8bd';ctx.fillRect(x+78, y-181, 2, 18);ctx.fillRect(x+78, y-181, 15, 2);
    }
    // Reinforced concrete columns: edge highlights, footing and visible rebar ties.
    [48, 310, 608, 908].forEach((x, i)=> {
      ctx.fillStyle= '#1a272e';ctx.fillRect(x-3, y-228, 17, 190);
      ctx.fillStyle= '#758083';ctx.fillRect(x, y-228, 3, 190);
      ctx.fillStyle= '#46565b';ctx.fillRect(x+10, y-228, 3, 190);
      for(let yy=y-210;yy<y-45;yy+=28) {
        ctx.fillStyle= '#92958a';ctx.fillRect(x+3, yy, 8, 2);
      }
      if((f.i+i)%3===0) {
        ctx.fillStyle= '#a05f4d';ctx.fillRect(x+5, y-82, 2, 22);ctx.fillRect(x+9, y-78, 2, 18);
      }
    });
    // Electrical conduit, junction boxes and ceiling fixtures with pixel highlights.
    ctx.fillStyle= '#17242b';ctx.fillRect(52, y-218, 4, 62);ctx.fillRect(52, y-218, 84, 4);
    ctx.fillStyle= '#8a9995';ctx.fillRect(55, y-217, 2, 57);ctx.fillRect(56, y-217, 77, 2);
    ctx.fillStyle= '#293940';ctx.fillRect(128, y-226, 22, 18);ctx.fillStyle= '#d6a45e';ctx.fillRect(133, y-222, 12, 3);ctx.fillRect(137, y-216, 4, 5);
    for(let x=180;x<850;x+=220) {
      ctx.fillStyle= '#1a252c';ctx.fillRect(x, y-230, 62, 9);ctx.fillStyle= '#d8c99a';ctx.fillRect(x+5, y-228, 52, 4);ctx.fillStyle= '#fff1c1';ctx.fillRect(x+12, y-224, 38, 2);
    }
    // Tile grout, skirting chips and loose concrete fragments.
    ctx.fillStyle= '#718084';ctx.fillRect(50, y-34, 860, 2);ctx.fillStyle= '#26343b';ctx.fillRect(50, y-31, 860, 5);
    for(let x=60;x<900;x+=48) {
      ctx.fillStyle= '#526166';ctx.fillRect(x, y-25, 1, 10);
    }
    for(let n=0;n<18;n++) {
      const x=65+Math.floor(pick(n+230)*820);const yy=y-5-Math.floor(pick(n+270)*8);ctx.fillStyle=n%2? '#8d8c82': '#555f60';ctx.fillRect(x, yy, 3+(n%3)*2, 2+(n%2)*2);
    }
    // Cracked plaster with small branching fractures and dust marks.
    ctx.strokeStyle= '#b5ad9b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(205, y-205);ctx.lineTo(214, y-190);ctx.lineTo(207, y-178);ctx.lineTo(221, y-164);ctx.moveTo(214, y-190);ctx.lineTo(229, y-196);ctx.moveTo(207, y-178);ctx.lineTo(194, y-170);ctx.stroke();
    ctx.fillStyle= '#b06a51';ctx.fillRect(213, y-174, 2, 8);ctx.fillRect(218, y-168, 2, 7);
  }
  function drawPlayer() {
    const p = player;
    if (p.invuln > 0 && Math.floor(elapsed * 15) % 2 === 0) return;
    const art = window.AFTERSHOCK_ART;
    if (art) art.drawHero(ctx, p, cameraY, helmet > 0, elapsed);
    const nearby = civilians.find(c =>
    !c.done &&
    Math.abs((p.x + p.w / 2) - c.x) < C.rescue.distance &&
    Math.abs((p.y + p.h) - c.y) < 75
    );
    if (nearby) {
      const x = Math.max(24, Math.round(p.x - 58));
      const y = Math.round(p.y - cameraY);
      ctx.fillStyle = '#071018dd';
      ctx.fillRect(x, y - 31, 170, 20);
      ctx.fillStyle = '#e9bd70';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('MANTÉN [E] PARA AUXILIAR', x + 6, y - 18);
      ctx.fillStyle = '#26343e';
      ctx.fillRect(x - 12, y - 9, 62, 5);
      ctx.fillStyle = '#9bc4a6';
      ctx.fillRect(x - 12, y - 9, 62 * clamp(nearby.progress / C.difficulty[selected].rescueTime, 0, 1), 5);
    }
  }
  function drawFloorHazards() {
    floorHazards.forEach((h, index)=> {
      if(!h.active)return;
      const x=Math.round(h.x), y=Math.round(h.y-cameraY);
      if(y<-35||y>640)return;
      if(h.type=== 'fire') {
        // Charred floor, glowing coals and staggered flame silhouettes.
        ctx.fillStyle= '#2a2020';ctx.fillRect(x-h.w/2, y-5, h.w, 8);
        ctx.fillStyle= '#813c2d';ctx.fillRect(x-h.w/2+4, y-7, h.w-8, 5);
        for(let i=0;i<6;i++) {
          const flick=Math.floor(Math.sin(elapsed*9+i*2.1)*3);
          const fx=x-h.w/2+7+i*11;
          ctx.fillStyle= '#9e442e';ctx.fillRect(fx-2, y-11-flick, 11, 12+flick);
          ctx.fillStyle=i%2? '#e16e50': '#f0a34e';ctx.fillRect(fx, y-15-flick, 6, 13+flick);
          ctx.fillStyle= '#ffe0a0';ctx.fillRect(fx+2, y-12-flick, 2, 6);
        }
        ctx.fillStyle= '#e9bd70';ctx.fillRect(x-2, y-22, 2, 3);ctx.fillRect(x+19, y-19, 2, 2);
      }
      else if(h.type=== 'electric') {
        // Torn cable, insulation fragments and visible electrical arcs.
        ctx.fillStyle= '#141d24';ctx.fillRect(x-h.w/2, y-5, h.w, 5);
        ctx.strokeStyle= '#202b32';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x-h.w/2, y-4);ctx.lineTo(x-h.w/4, y+1);ctx.lineTo(x, y-5);ctx.lineTo(x+h.w/4, y+1);ctx.lineTo(x+h.w/2, y-4);ctx.stroke();
        ctx.strokeStyle= '#d8a54d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-h.w/2+5, y-4);ctx.lineTo(x-h.w/4, y+1);ctx.lineTo(x, y-5);ctx.lineTo(x+h.w/4, y+1);ctx.lineTo(x+h.w/2-4, y-4);ctx.stroke();
        for(let i=0;i<4;i++) {
          const sx=x-18+i*12, sy=y-10+(i%2)*3;
          ctx.fillStyle= '#f4d47d';ctx.fillRect(sx, sy, 3, 3);
          if((Math.floor(elapsed*14)+i)%3!==0) {
            ctx.strokeStyle= '#f4d47d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx+1, sy);ctx.lineTo(sx+5, sy-6);ctx.lineTo(sx+8, sy-2);ctx.stroke();
          }
        }
      }
      else {
        // Concrete chunks with fractured highlights and dust.
        ctx.fillStyle= '#252e32';ctx.fillRect(x-h.w/2, y-8, h.w, 9);
        ctx.fillStyle= '#667174';ctx.fillRect(x-h.w/2+4, y-13, 19, 9);ctx.fillRect(x-5, y-17, 20, 13);ctx.fillRect(x+14, y-10, 17, 7);
        ctx.fillStyle= '#a5a397';ctx.fillRect(x-h.w/2+7, y-13, 10, 3);ctx.fillRect(x-2, y-17, 9, 3);ctx.fillRect(x+18, y-10, 8, 2);
        ctx.fillStyle= '#414c4e';ctx.fillRect(x-17, y-4, 9, 3);ctx.fillRect(x+8, y-5, 12, 3);
      }
    });
  }
  function drawItems() {
    items.forEach(item => {
      if (window.AFTERSHOCK_ART) {
        window.AFTERSHOCK_ART.drawPickup(ctx, item, cameraY, elapsed);
      }
    });
  }
  function drawCivilians() {
    civilians.forEach((civilian, index) => {
      if (window.AFTERSHOCK_ART) {
        window.AFTERSHOCK_ART.drawCivilian(ctx, civilian, index, cameraY);
      }
    });
  }
  function drawHazards() {
    hazards.forEach(h=> {
      const y=h.y-cameraY;
      if(h.warning>0) {
        const pulse=.65+.35*Math.sin(elapsed*12);
        ctx.globalAlpha=pulse;ctx.strokeStyle= '#ef7758';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(h.x, y-12, 10+Math.sin(elapsed*10)*2, 0, Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(h.x, y-85);ctx.lineTo(h.x, y-22);ctx.stroke();
        ctx.fillStyle= '#e16e50';ctx.fillRect(h.x-11, y-8, 22, 4);
        ctx.font= 'bold 12px monospace';ctx.fillText('!', h.x-3, y-15);ctx.globalAlpha=1;
      }
      else {
        ctx.save();ctx.translate(Math.round(h.x), Math.round(y));ctx.rotate(h.rot);
        // Jagged concrete fragment rather than a plain falling rectangle.
        ctx.fillStyle= '#111820';ctx.beginPath();ctx.moveTo(-h.w/2, -h.h/3);ctx.lineTo(-h.w/4, -h.h/2);ctx.lineTo(h.w/2, -h.h/3);ctx.lineTo(h.w/2, h.h/3);ctx.lineTo(h.w/5, h.h/2);ctx.lineTo(-h.w/2, h.h/3);ctx.closePath();ctx.fill();
        ctx.fillStyle= '#7f8580';ctx.beginPath();ctx.moveTo(-h.w/2+2, -h.h/3);ctx.lineTo(-h.w/4, -h.h/2+2);ctx.lineTo(h.w/2-2, -h.h/3+2);ctx.lineTo(h.w/2-3, h.h/4);ctx.lineTo(-h.w/3, h.h/3);ctx.closePath();ctx.fill();
        ctx.fillStyle= '#b5aa96';ctx.fillRect(-h.w/4, -h.h/3, Math.max(4, h.w/3), Math.max(3, h.h/4));
        ctx.fillStyle= '#505b5b';ctx.fillRect(-h.w/2+3, h.h/5, Math.max(4, h.w/3), 2);
        ctx.fillStyle= '#a05f4d';ctx.fillRect(h.w/4, -h.h/2, 2, Math.max(4, h.h/3));
        ctx.restore();
      }
    });
  }
  function drawParticles() {
    particles.forEach(p=> {
      ctx.globalAlpha=clamp(p.life/p.max, 0, 1);ctx.fillStyle=p.color;ctx.fillRect(p.x, p.y-cameraY, p.size, p.size);ctx.globalAlpha=1;
    });
  }
  function drawOverlayText() {
    ctx.fillStyle= '#d4dce0';ctx.font= '11px monospace';ctx.fillText('▼ DESCENSO', 40, 28);ctx.fillStyle= '#d96b50';ctx.fillRect(40, 38, 80, 3);ctx.fillStyle= '#7e8b95';ctx.fillRect(120, 38, 120, 3);
  }
  /* 05 — BUCLE PRINCIPAL E INPUT */
  function loop(now) {
    if(state!== 'playing')return;const dt=Math.min(.033, (now-last)/1000||0);last=now;update(dt);particles.forEach(p=> {
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=360*dt;p.life-=dt;
    });particles=particles.filter(p=>p.life>0);draw();if(state=== 'playing')raf=requestAnimationFrame(loop);
  }
  // Input
  window.addEventListener('keydown', e=> {
    if(['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'ArrowDown'].includes(e.key))e.preventDefault();if(e.repeat&&e.key=== 'Escape')return;switch(e.key.toLowerCase()) {
      case 'a':case 'arrowleft':keys.left=true;break;case 'd':case 'arrowright':keys.right=true;break;case ' ':case 'w':case 'arrowup':keys.jump=true;break;case 'shift':keys.run=true;break;case 's':case 'arrowdown':keys.duck=true;break;case 'e':keys.interact=true;break;case 'escape':pause();break;
    }
  });
  window.addEventListener('keyup', e=> {
    switch(e.key.toLowerCase()) {
      case 'a':case 'arrowleft':keys.left=false;break;case 'd':case 'arrowright':keys.right=false;break;case ' ':case 'w':case 'arrowup':keys.jump=false;break;case 'shift':keys.run=false;break;case 's':case 'arrowdown':keys.duck=false;break;case 'e':keys.interact=false;break;
    }
  });
  // Controles táctiles: mantener pulsado para caminar/correr y tocar para saltar o interactuar.
  const touchButtons = document.querySelectorAll('#aftershock-root [data-control]');
  const touchMap = { left: 'left', right: 'right', run: 'run', duck: 'duck', jump: 'jump', interact: 'interact' };
  touchButtons.forEach(button => {
    const control = touchMap[button.dataset.control];
    const release = event => {
      if (event) event.preventDefault();
      keys[control] = false;
      button.classList.remove('pressed');
      try {
        if (button.hasPointerCapture && button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      } catch (_) { /* Algunos navegadores cancelan la captura antes de pointerup. */ }
    };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (state !== 'playing') return;
      keys[control] = true;
      button.classList.add('pressed');
      try {
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      } catch (_) { /* La entrada táctil sigue funcionando sin captura explícita. */ }
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', () => { keys[control] = false; button.classList.remove('pressed'); });
    button.addEventListener('contextmenu', event => event.preventDefault());
  });
  window.addEventListener('blur', () => Object.keys(keys).forEach(key => { keys[key] = false; }));
  function updateMenuDifficulty() {
    const key=$('difficulty').value, count=C.building.floorsByDifficulty[key], seconds=C.difficulty[key].time;const art=$('artBuilding');art.innerHTML= '';for(let i=0;i<count;i++) {
      const row=document.createElement('div');row.className= 'art-floor';row.innerHTML= '<i></i><i></i><i></i>';art.appendChild(row);
    }
    const exit=document.createElement('div');exit.className= 'art-exit';exit.textContent= 'SALIDA';art.appendChild(exit);$('artLabel').innerHTML= `BLOQUE RESIDENCIAL<br>07 / ${String(count).padStart(2,'0')} PISOS`;$('difficultyMeta').textContent= `${count} PISOS · ${seconds} SEGUNDOS · ${C.difficulty[key].lives} VIDAS`;
  }
  $('difficulty').addEventListener('change', updateMenuDifficulty);updateMenuDifficulty();
  $('playBtn').onclick = start;
  $('trainingBtn').onclick = startTraining;
  $('resumeBtn').onclick = pause;
  $('restartPause').onclick = beginGame;
  $('againBtn').onclick = beginGame;
  $('homeBtn').onclick = () => {
    document.getElementById('gameFrame').classList.remove('touch-active');
    state = 'menu';
    training = false;
    ui.result.classList.add('hidden');
    ui.hud.classList.add('hidden');
    ui.trainingGuide.classList.add('hidden');
    ui.menu.classList.remove('hidden');
    selected = $('difficulty').value;
    reset();
    draw();
  };
  $('soundBtn').onclick = () => {
    sound = !sound;
    $('soundBtn').innerHTML = sound ? '♫ <span>SONIDO</span>' : '♫ <span>MUDO</span>';
  };
  // Primera escena: menú y edificio visibles, sin comenzar una partida.
  ui.hud.classList.add('hidden');
  ui.trainingGuide.classList.add('hidden');
  training = false;
  selected = $('difficulty').value;
  reset();
  draw();
})();
