/* 跨页音乐续播桥：索引页(有 #audio)持续保存 {src,t,vol,playing} 到 localStorage；
   Gallery 等其它页(无 #audio)读取该状态，用隐藏 audio 同进度续播。 */
(function () {
  var KEY = 'home-music';
  function load(){ try{ var s=localStorage.getItem(KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
  function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  window.__musicResume = load();   // 供索引页进入时读取

  var audio = document.getElementById('audio');
  function abs(){ return (audio && (audio.currentSrc||audio.src)) || ''; }

  if (audio) {
    // 索引页：保存播放状态
    var last = 0;
    function persist(){
      save({ src: abs(), t: Math.floor(audio.currentTime||0), vol: audio.volume, playing: !audio.paused, at: Date.now() });
    }
    audio.addEventListener('play', persist);
    audio.addEventListener('pause', persist);
    audio.addEventListener('ended', function(){ save({ src:'', t:0, vol:audio.volume, playing:false, at:Date.now() }); });
    audio.addEventListener('timeupdate', function(){ var n=Date.now(); if(n-last>2500){ last=n; persist(); } });
    window.addEventListener('pagehide', persist);
  } else {
    // 其它页（无 #audio）：用隐藏 audio 同进度续播
    var s = load();
    if (s && s.src) {
      var a = new Audio(); a.preload = 'auto'; a.src = s.src;
      a.volume = (typeof s.vol === 'number' && s.vol >= 0) ? s.vol : 0.175;
      var t0 = (typeof s.t === 'number' && s.t > 0) ? s.t : 0;
      // 关键：先定位到上次进度再播放，避免“从 0 秒跳到目标位置”造成的卡顿/爆音
      function seekableEnough(){ try { return a.seekable && a.seekable.length && a.seekable.end(0) >= t0 - 1; } catch(e){ return false; } }
      function doSeek(){ try { if (seekableEnough()) { a.currentTime = t0; return true; } } catch(e){} return false; }
      try { if (t0) a.currentTime = t0; } catch(e){}   // 尽早尝试定位
      var tries = 0, started = false;
      function startPlay(){ if (started) return; started = true; if (s.playing && a.paused) a.play().catch(function(){}); }
      function poll(){ if (doSeek()) { startPlay(); return; } if (++tries < 80) setTimeout(poll, 80); else startPlay(); }
      a.addEventListener('loadedmetadata', poll);
      a.addEventListener('canplay', function(){ if (s.playing && a.paused) startPlay(); }, { once: true });
      setTimeout(function(){ if (s.playing && a.paused) startPlay(); }, 1200);   // 兜底：避免极端情况下静音过久
      function persistG(){ save({ src: s.src, t: Math.floor(a.currentTime || 0), vol: a.volume, playing: !a.paused, at: Date.now() }); }
      var lg = 0;
      a.addEventListener('timeupdate', function(){ var n = Date.now(); if (n - lg > 2500) { lg = n; persistG(); } });
      a.addEventListener('play', persistG);
      a.addEventListener('pause', persistG);
      window.addEventListener('pagehide', persistG);
    }
  }
})();
