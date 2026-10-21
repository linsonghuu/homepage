(function(){
  if (window.__playerInited) return;
  window.__playerInited = true;
  var isHome = !!document.querySelector('.bento');
  // 跨页面刷新续播：从 localStorage 读取上次曲目 / 进度
  try { window.__musicResume = JSON.parse(localStorage.getItem('home-music') || 'null'); } catch(e){}
  window.addEventListener('pagehide', function(){
    try {
      var a = document.getElementById('audio');
      if (a) localStorage.setItem('home-music', JSON.stringify({ src: a.currentSrc || a.src, t: a.currentTime, vol: a.volume, playing: !a.paused }));
    } catch(e){}
  });

  const audio     = document.getElementById('audio');
  const pbtn      = document.getElementById('pbtn');
  const playerbar = document.getElementById('playerbar');
  const pfill     = document.getElementById('pfill');
  const ptime     = document.getElementById('ptime');
  const ptrack    = document.getElementById('ptrack');

  const VOL_KEY = 'home-vol';
  let savedVol = null;
  try { savedVol = parseFloat(localStorage.getItem(VOL_KEY)); } catch(err){}
  audio.volume = (isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) ? savedVol : 0.175;

  const fmt = s => {
    if (!isFinite(s) || s < 0) return '0:00';
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };

  const volSlider = document.getElementById('vol');
  function saveVol(){
    try { localStorage.setItem(VOL_KEY, String(audio.volume)); } catch(err){}
  }
  function setVolume(v){
    const n = Math.min(1, Math.max(0, v));
    audio.volume = n;
    volSlider.value = String(Math.round(n * 100));
    saveVol();
  }
  volSlider.value = String(Math.round(audio.volume * 100));
  volSlider.addEventListener('input', () => { audio.volume = volSlider.value / 100; saveVol(); });
  volSlider.addEventListener('click', e => e.stopPropagation());

  const canHover = window.matchMedia('(hover: hover)').matches;
  if (canHover){
    playerbar.addEventListener('pointermove', e => {
      const r = playerbar.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      artImg.style.transform = 'translate(' + (x * 5).toFixed(2) + 'px,' + (y * 5).toFixed(2) + 'px) scale(1.16)';
    });
    playerbar.addEventListener('pointerleave', () => {
      artImg.style.transform = 'scale(1.08)';
    });
  }

  const keysPanel = document.getElementById('keys');
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key){
      case ' ':            e.preventDefault(); togglePlay(); break;
      case 'ArrowRight':   loadTrack(cur + 1, true); break;
      case 'ArrowLeft':    loadTrack(cur - 1, true); break;
      case 'ArrowUp':      e.preventDefault(); setVolume(audio.volume + .05); break;
      case 'ArrowDown':    e.preventDefault(); setVolume(audio.volume - .05); break;
      case 'm': case 'M':  audio.muted = !audio.muted; break;
      case '?':            keysPanel.classList.toggle('show'); break;
      case 'Escape':       keysPanel.classList.remove('show'); document.getElementById('plist').classList.remove('show'); break;
      case 'l': case 'L':  toggleList(); break;
    }
  });

  const AUDIO_CDN   = '';
  const AUDIO_LOCAL = '';

  const localOnly = {};

  const PLAYLIST = [
    { title:'Lonely Day', artist:'Jurrivh',                 src:'/lonely-day-jurrivh.mp3',   cover:'/cover-lonely-day.jpg',   dur:242.21 },
    { title:'2017',       artist:'Ólafur Arnalds',          src:'/2017-olafur-arnalds.mp3',  cover:'/cover-2017-olafur-arnalds.jpg',  dur:355.24 },
    { title:'Epilogue',   artist:'Ólafur Arnalds',          src:'/epilogue-olafur-arnalds.mp3',    cover:'/cover-epilogue-olafur-arnalds.jpg',   dur:249.08 },
    { title:'This Place Is a Shelter', artist:'Ólafur Arnalds', src:'/this-place-is-a-shelter-olafur-arnalds.mp3', cover:'/cover-this-place-is-a-shelter-olafur-arnalds.jpg', dur:138.36 }
  ];

  const artImg   = document.getElementById('artImg');
  const pTitle   = document.getElementById('ptitle');
  const pArtist  = document.getElementById('partist');
  const pNext    = document.getElementById('pnext');
  const pPrev    = document.getElementById('pprev');
  const preloaded = {};

  const plist = document.getElementById('plist');

  function renderPlaylist(){
    plist.innerHTML = '';
    PLAYLIST.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (i === cur) b.className = 'on';
      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = i === cur ? '♪' : String(i + 1);
      const tt = document.createElement('span');
      tt.className = 'tt';
      tt.textContent = t.title;
      const du = document.createElement('span');
      du.className = 'du';
      du.textContent = fmt(t.dur);
      b.append(idx, tt, du);
      b.addEventListener('click', ev => {
        ev.stopPropagation();
        loadTrack(i, true);
        toggleList(false);
      });
      plist.appendChild(b);
    });
  }

  function positionList(){
    const r = playerbar.getBoundingClientRect();
    plist.style.bottom = Math.round(window.innerHeight - r.top + 10) + 'px';
  }

  function toggleList(force){
    const open = typeof force === 'boolean' ? force : !plist.classList.contains('show');
    if (open){ renderPlaylist(); positionList(); }
    plist.classList.toggle('show', open);
  }

  let cur = Math.floor(Math.random() * PLAYLIST.length);
  let initialPicked = false;

  function pickInitial(){
    if (initialPicked) return;
    initialPicked = true;
    loadTrack(cur, false);
    audio.preload = 'auto';
    try { audio.load(); } catch(err){}

    audio.addEventListener('canplaythrough', startRest, { once: true });
    setTimeout(startRest, 25000);
  }

  let restStarted = false;
  function startRest(){
    if (restStarted) return;
    restStarted = true;
    if (window.requestIdleCallback) requestIdleCallback(preloadRest, { timeout: 7000 });
    else setTimeout(preloadRest, 3000);
  }

  const SNOW_CODES = [71, 73, 75, 77, 85, 86];
  setTimeout(pickInitial, 1500);

  function loadTrack(i, autoplay){
    cur = (i + PLAYLIST.length) % PLAYLIST.length;
    const t = PLAYLIST[cur];
    const base = localOnly[cur] ? AUDIO_LOCAL : AUDIO_CDN;
    audio.src = base + t.src;
    artImg.src = base + t.cover;
    try { artImg.fetchPriority = 'high'; } catch(err){}
    pTitle.textContent  = t.title;
    pArtist.textContent = t.artist;
    pfill.style.width = '0%';
    ptime.textContent = '0:00 / ' + fmt(t.dur);
    if (autoplay) audio.play().catch(() => {});
    if (plist.classList.contains('show')) renderPlaylist();
  }

  const prefetchQueue = [];
  let prefetching = false;

  function prefetchNext(){
    if (prefetchQueue.length === 0){ prefetching = false; return; }
    const i = prefetchQueue.shift();
    if (preloaded[i]){ prefetchNext(); return; }
    preloaded[i] = true;
    prefetching = true;

    const a = new Audio();
    a.preload = 'auto';
    let moved = false;
    const advance = () => {
      if (moved) return;
      moved = true;
      setTimeout(prefetchNext, 400);
    };
    a.addEventListener('canplaythrough', advance);
    a.addEventListener('error', advance);
    setTimeout(advance, 10000);
    a.src = (localOnly[i] ? AUDIO_LOCAL : AUDIO_CDN) + PLAYLIST[i].src;
  }

  function preloadRest(){
    // 省流量：只预取“下一首”，不预取整个播放列表； weaker network / 省流量模式干脆不预取
    var conn = navigator.connection || {};
    var saveData = conn.saveData || /(^|-)2g/.test(conn.effectiveType || '');
    if (!saveData){
      var next = (cur + 1) % PLAYLIST.length;
      if (next !== cur && !preloaded[next]) prefetchQueue.push(next);
    }
    if (!prefetching) prefetchNext();
  }

  pNext.addEventListener('click', e => {
    e.stopPropagation();
    loadTrack(cur + 1, true);
  });
  pPrev.addEventListener('click', e => {
    e.stopPropagation();
    loadTrack(cur - 1, true);
  });

  const artBox = document.querySelector('.art');
  artBox.addEventListener('click', e => {
    e.stopPropagation();
    toggleList();
  });
  pTitle.addEventListener('click', e => {
    e.stopPropagation();
    toggleList();
  });
  window.addEventListener('resize', () => {
    if (plist.classList.contains('show')) positionList();
  });

  audio.addEventListener('ended', () => loadTrack(cur + 1, true));

  const gate = document.getElementById('gate');
  let entered = false;

  function enterSite(){
    if (entered) return;
    entered = true;
    try { sessionStorage.setItem('home-entered','1'); } catch(err){}

    // 续播：按上次的曲目恢复（从图片集等返回时不重新开始）
    var r = window.__musicResume;
    if (r && r.src){
      var base = r.src.split('/').pop();
      for (var k=0;k<PLAYLIST.length;k++){ if (PLAYLIST[k].src === base){ cur = k; break; } }
    }

    document.body.classList.add('entered');
    if (gate){
      gate.classList.add('gone');
      setTimeout(() => { gate.style.display = 'none'; }, 800);
    }
    pickInitial();
    kickAudio();

    if (window.requestIdleCallback) requestIdleCallback(() => { try { ensureGiscus(); } catch(err){} }, { timeout: 6000 });
    else setTimeout(() => { try { ensureGiscus(); } catch(err){} }, 4500);

    // 播放：立即 play，再用短轮询在 seekable 就绪后把进度跳到上次位置（健壮，避免 load() 复位又从头播）
    var wantPlay = (!r || r.playing !== false);
    var needTap = function(){ playerbar.classList.add('blocked'); document.body.classList.add('need-tap'); };
    if (r && typeof r.t === 'number'){
      if (wantPlay) audio.play().catch(needTap);
      var n = 0;
      (function fix(){
        try {
          if (r.t && Math.abs(audio.currentTime - r.t) > 2){
            var end = (audio.seekable.length ? audio.seekable.end(0) : (audio.duration || 0));
            if (end >= r.t - 1) audio.currentTime = r.t;
          }
        } catch(e){}
        if (++n < 15) setTimeout(fix, 180);
      })();
    } else if (wantPlay){
      audio.play().catch(needTap);
    }
  }

  if (gate){
    gate.addEventListener('click', enterSite);
    gate.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); enterSite(); }
    });
    // 从图片集/子页返回主页：同标签页内已进入过 → 跳过入口门直接进主页
    requestAnimationFrame(function(){
      try { if (sessionStorage.getItem('home-entered')==='1') enterSite(); } catch(err){}
    });
  }

  function totalTime(){
    const d = audio.duration;
    return (isFinite(d) && d > 0) ? d : PLAYLIST[cur].dur;
  }

  function render(){
    const d = totalTime();
    const c = audio.currentTime || 0;
    pfill.style.width = Math.min(100, c / d * 100) + '%';
    ptime.textContent = fmt(c) + ' / ' + fmt(d);
  }

  function togglePlay(){
    if (audio.paused){
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  playerbar.addEventListener('click', e => {
    if (e.target.closest('#ptrack')) return;
    togglePlay();
  });

  audio.addEventListener('play', () => {
    pbtn.classList.add('playing');
    playerbar.classList.add('playing');
    playerbar.classList.remove('blocked');
    document.body.classList.remove('need-tap');
  });
  audio.addEventListener('pause', () => {
    pbtn.classList.remove('playing');
    playerbar.classList.remove('playing');
  });
  audio.addEventListener('timeupdate', render);
  audio.addEventListener('loadedmetadata', render);

  audio.addEventListener('waiting', () => { ptime.textContent = '缓冲中…'; });
  audio.addEventListener('playing', render);
  audio.addEventListener('error', () => {

    if (!localOnly[cur]){
      localOnly[cur] = true;
      const wasPlaying = !audio.paused;
      ptime.textContent = '切换备用音源';
      setTimeout(() => loadTrack(cur, wasPlaying), 300);
      return;
    }
    ptime.textContent = '音频加载失败';
    playerbar.classList.add('blocked');
    document.body.classList.add('need-tap');
  });

  let dragging = false;

  function seekTo(clientX){
    const dur = totalTime();
    if (!dur) return;
    const r = ptrack.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    audio.currentTime = ratio * dur;
    render();
  }

  ptrack.addEventListener('pointerdown', e => {
    e.stopPropagation();
    dragging = true;
    try { ptrack.setPointerCapture(e.pointerId); } catch(err){}
    seekTo(e.clientX);
  });
  ptrack.addEventListener('pointermove', e => {
    if (dragging) seekTo(e.clientX);
  });
  ptrack.addEventListener('pointerup',     () => { dragging = false; });
  ptrack.addEventListener('pointercancel', () => { dragging = false; });

  render();

  const BASE_TITLE = 'linsongりんそん';
  let titleTimer = null;

  function loopTitle(){
    clearInterval(titleTimer);
    let i = 0;
    let dir = 1;
    let hold = 0;

    titleTimer = setInterval(() => {
      if (hold > 0){ hold--; return; }

      if (dir === 1){
        i++;
        document.title = BASE_TITLE.slice(0, i);
        if (i >= BASE_TITLE.length){ dir = -1; hold = 26; }
      } else {
        i--;

        document.title = i > 0 ? BASE_TITLE.slice(0, i) : BASE_TITLE.slice(0, 1);
        if (i <= 0){ dir = 1; hold = 8; }
      }
    }, 110);
  }

  if (isHome) loopTitle();
  const fxCanvas = document.getElementById('weather-fx');
  const fxCtx = fxCanvas.getContext('2d');
  let fxRAF = null, fxType = null, fxParticles = [], fxWind = 0, fxTime = 0;
  let fxFrameStart = 0, fxFrameCost = 0;

  const RAIN_LAYERS = [
    { w: 0.7, a: 0.09 },
    { w: 0.9, a: 0.15 },
    { w: 1.1, a: 0.22 },
    { w: 1.4, a: 0.30 }
  ];
  const RAIN_TYPES = ['lightrain','rain','heavyrain'];

  function fxResize(){
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
  }
  fxResize();
  window.addEventListener('resize', fxResize);

  function weatherFXType(code){
    if ([71,73,75,77,85,86].includes(code)) return 'snow';
    if ([51,53,80].includes(code)) return 'lightrain';
    if ([55,61,63,81].includes(code)) return 'rain';
    if ([56,57,65,66,67,82,95,96,99].includes(code)) return 'heavyrain';
    if ([45,48].includes(code)) return 'fog';
    if ([0,1].includes(code)) return 'clear';
    return 'cloudy';
  }

  function rainDrop(w, h, baseV, baseLen){
    const z = 0.35 + Math.random() * 1.05;
    const layer = Math.min(3, Math.floor((z - 0.35) / 1.05 * 4));
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      z: z,
      layer: layer,
      vy: baseV * z,
      len: baseLen * z,
      type: 'rain'
    };
  }

  function fxParticle(t, w, h){
    if (t === 'lightrain') return rainDrop(w, h, 3.4, 6);
    if (t === 'rain')      return rainDrop(w, h, 6.2, 11);
    if (t === 'heavyrain') return rainDrop(w, h, 9.5, 17);
    if (t === 'snow'){
      return {
        x: Math.random()*w, y: Math.random()*h,
        vy: Math.random()*1.5 + 0.6,
        wob: Math.random()*Math.PI*2,
        wobR: Math.random()*1.2 + 0.4,
        size: Math.random()*2.2 + 1.2,
        op: Math.random()*0.5 + 0.3,
        type:'snow'
      };
    }
    if (t === 'fog'){
      return {
        x: Math.random()*w, y: Math.random()*h,
        vx: Math.random()*0.3 + 0.1,
        size: Math.random()*60 + 40,
        op: Math.random()*0.04 + 0.02,
        type:'fog'
      };
    }
    if (t === 'clear'){
      return {
        x: Math.random()*w, y: h + Math.random()*100,
        vy: -(Math.random()*0.3 + 0.1),
        vx: 0,
        size: Math.random()*2 + 0.8,
        op: Math.random()*0.4 + 0.15,
        tw: Math.random()*Math.PI*2,
        type:'clear'
      };
    }

    return {
      x: Math.random()*w, y: Math.random()*h,
      vx: Math.random()*0.15 + 0.05,
      vy: 0,
      size: Math.random()*1.5 + 0.8,
      op: Math.random()*0.12 + 0.05,
      type:'cloudy'
    };
  }

  function fxInit(t){
    fxType = t;
    const w = fxCanvas.width, h = fxCanvas.height;
    const counts = {lightrain:60, rain:150, heavyrain:300, snow:120, fog:12, clear:35, cloudy:25};
    const n = counts[t] || 0;
    fxParticles = [];
    for (let i = 0; i < n; i++) fxParticles.push(fxParticle(t, w, h));
  }

  function fxLoop(){
    if (!fxType){ fxRAF = null; return; }
    fxFrameStart = performance.now();
    const w = fxCanvas.width, h = fxCanvas.height;
    fxCtx.clearRect(0, 0, w, h);
    fxTime += 0.008;
    fxWind = 0;

    const rainBuckets = [[], [], [], []];

    for (let p of fxParticles){
      if (p.type === 'rain'){
        p.y += p.vy;
        if (p.y > h){ p.y = -p.len; p.x = Math.random()*w; }
        rainBuckets[p.layer].push(p.x, p.y, p.len);
      }
      else if (p.type === 'snow'){
        p.wob += 0.02;
        p.x += Math.sin(p.wob) * p.wobR * 0.4;
        p.y += p.vy;
        if (p.y > h){ p.y = -p.size; p.x = Math.random()*w; }
        if (p.x > w+5) p.x = -5; else if (p.x < -5) p.x = w+5;
        fxCtx.fillStyle = 'rgba(245,245,250,' + p.op + ')';
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        fxCtx.fill();
      }
      else if (p.type === 'fog'){
        p.x += p.vx;
        if (p.x > w + p.size) p.x = -p.size;
        const grad = fxCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, 'rgba(80,85,95,' + p.op + ')');
        grad.addColorStop(1, 'rgba(80,85,95,0)');
        fxCtx.fillStyle = grad;
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        fxCtx.fill();
      }
      else if (p.type === 'clear'){
        p.y += p.vy;
        p.tw += 0.03;
        if (p.y < -10){ p.y = h + 10; p.x = Math.random()*w; }
        const flicker = (Math.sin(p.tw) * 0.5 + 0.5) * p.op;
        fxCtx.fillStyle = 'rgba(255,230,180,' + flicker + ')';
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        fxCtx.fill();
      }
      else if (p.type === 'cloudy'){
        p.x += p.vx;
        if (p.x > w + 10) p.x = -10;
        fxCtx.fillStyle = 'rgba(120,125,135,' + p.op + ')';
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        fxCtx.fill();
      }
    }

    for (let i = 0; i < 4; i++){
      const b = rainBuckets[i];
      if (!b.length) continue;
      const L = RAIN_LAYERS[i];
      fxCtx.strokeStyle = 'rgba(206,218,236,' + L.a + ')';
      fxCtx.lineWidth = L.w;
      fxCtx.lineCap = 'round';
      fxCtx.beginPath();
      for (let k = 0; k < b.length; k += 3){
        fxCtx.moveTo(b[k], b[k + 1]);
        fxCtx.lineTo(b[k], b[k + 1] + b[k + 2]);
      }
      fxCtx.stroke();
    }

    fxFrameCost += performance.now() - fxFrameStart;

    fxRAF = requestAnimationFrame(fxLoop);
  }

  function fxCheckPerf(){
    if (fxFrameCost <= 30) return;
    const floor = (fxType === 'heavyrain') ? 120 : 60;
    const keep = Math.max(floor, Math.ceil(fxParticles.length / 2));
    fxParticles.length = Math.min(fxParticles.length, keep);
    fxFrameCost = 0;
  }
  setInterval(fxCheckPerf, 1000);

  function startWeatherFX(type){
    if (!type || type === fxType) return;
    fxInit(type);
    fxCanvas.classList.add('show');
    if (!fxRAF) fxRAF = requestAnimationFrame(fxLoop);
  }

  const fxbar = document.getElementById('fxbar');
  function markFxBtn(t){
    fxbar.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.w === t);
    });
  }
  fxbar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    startWeatherFX(b.dataset.w);
    markFxBtn(b.dataset.w);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && fxRAF){ cancelAnimationFrame(fxRAF); fxRAF = null; }
    else if (!document.hidden && !fxRAF && fxType){ fxRAF = requestAnimationFrame(fxLoop); }
  });
  const eqEl = document.getElementById('eq');
  const eqCtx = eqEl.getContext('2d');
  let eqW = 96, eqH = 22, eqDPR = 1;
  let actx = null, analyser = null, timeData = null, eqRAF = null, eqBuilt = false, eqPhase = 0, eqPhaseSlow = 0;

  function eqSize(){
    eqDPR = Math.min(window.devicePixelRatio || 1, 2);
    eqW = eqEl.clientWidth || 96;
    eqH = eqEl.clientHeight || 20;
    eqEl.width = Math.round(eqW * eqDPR);
    eqEl.height = Math.round(eqH * eqDPR);
    eqCtx.setTransform(eqDPR, 0, 0, eqDPR, 0, 0);
  }
  eqSize();
  window.addEventListener('resize', eqSize);

  function buildAnalyser(){
    if (eqBuilt) return analyser;
    eqBuilt = true;
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      const src = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      analyser.connect(actx.destination);
      timeData = new Uint8Array(analyser.fftSize);
      eqEl.classList.add('live');
    }catch(err){
      analyser = null;
    }
    return analyser;
  }

  function eqDraw(now, live){
    eqCtx.clearRect(0, 0, eqW, eqH);
    const mid = eqH / 2;
    const amp = mid - 1.6;
    const GAIN = 2.8;
    const P = Math.max(64, Math.floor(eqW * 1.5));
    const pts = [];
    if (live && timeData){
      analyser.getByteTimeDomainData(timeData);
      const n = timeData.length;
      for (let p = 0; p <= P; p++){
        const xi = Math.floor(p / P * (n - 1));
        const v = (timeData[xi] - 128) / 128;
        let y = mid + v * amp * GAIN;
        if (y < 1) y = 1; else if (y > eqH - 1) y = eqH - 1;
        pts.push([p / P * eqW, y]);
      }
    } else {
      eqPhase += 0.05;
      eqPhaseSlow += 0.012;
      const swell = 0.55 + 0.45 * Math.sin(eqPhaseSlow);
      for (let x = 0; x <= eqW; x += 1){
        const a = Math.sin(x * 0.14 + eqPhase);
        const b = 0.6 * Math.sin(x * 0.31 - eqPhase * 0.7);
        const v = (a + b) * 0.12 * swell;
        let y = mid + v * amp * GAIN;
        if (y < 1) y = 1; else if (y > eqH - 1) y = eqH - 1;
        pts.push([x, y]);
      }
    }
    const fill = eqCtx.createLinearGradient(0, 0, 0, eqH);
    fill.addColorStop(0, 'rgba(245,245,245,0.14)');
    fill.addColorStop(0.5, 'rgba(245,245,245,0.05)');
    fill.addColorStop(1, 'rgba(245,245,245,0.14)');
    eqCtx.beginPath();
    eqCtx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) eqCtx.lineTo(pts[i][0], pts[i][1]);
    for (let i = pts.length - 1; i >= 0; i--) eqCtx.lineTo(pts[i][0], 2 * mid - pts[i][1]);
    eqCtx.closePath();
    eqCtx.shadowBlur = 0;
    eqCtx.fillStyle = fill;
    eqCtx.fill();
    const grad = eqCtx.createLinearGradient(0, 0, 0, eqH);
    grad.addColorStop(0, 'rgba(245,245,245,0.95)');
    grad.addColorStop(1, 'rgba(245,245,245,0.30)');
    eqCtx.lineWidth = 1.6;
    eqCtx.lineJoin = 'round';
    eqCtx.lineCap = 'round';
    eqCtx.strokeStyle = grad;
    eqCtx.shadowColor = 'rgba(245,245,245,0.35)';
    eqCtx.shadowBlur = 5;
    eqCtx.beginPath();
    eqCtx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) eqCtx.lineTo(pts[i][0], pts[i][1]);
    eqCtx.stroke();
    eqCtx.shadowBlur = 0;
  }

  function eqFrame(now){
    eqRAF = requestAnimationFrame(eqFrame);
    eqDraw(now, analyser && !audio.paused);
  }

  function kickAudio(){
    if (!analyser) buildAnalyser();
    if (actx && actx.state === 'suspended') actx.resume();
    if (!eqRAF) eqFrame();
  }
  document.addEventListener('pointerdown', kickAudio, { once: true });
})();
