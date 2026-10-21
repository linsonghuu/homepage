(function(){
  try{
    var diag = document.getElementById('diag');

    function hash(s){ var h=5381; for(var i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))>>>0; } return h.toString(16); }

    function row(parent, label, val){
      var r = document.createElement('div'); r.className='row';
      var line = document.createElement('div'); line.className='rline';
      var b = document.createElement('b'); b.textContent=label;
      var s = document.createElement('span'); s.textContent=(val==null||val===''?'—':val);
      line.appendChild(b); line.appendChild(s); r.appendChild(line);
      var ex = EXP[label];
      if(ex){ b.title = ex; var e = document.createElement('div'); e.className='exp'; e.textContent = ex; r.appendChild(e); }
      parent.appendChild(r);
    }

    function canvasFP(){
      try{
        var c=document.createElement('canvas'); c.width=240; c.height=60;
        var x=c.getContext('2d'); x.textBaseline='top'; x.font="14px 'Arial'";
        x.fillStyle='#f60'; x.fillRect(10,10,80,30);
        x.fillStyle='#069'; x.fillText('visitor-fp', 12, 14);
        x.fillStyle='rgba(120,20,200,.6)'; x.fillText('visitor-fp', 14, 16);
        return hash(c.toDataURL());
      }catch(e){ return 'n/a'; }
    }

    function webglInfo(){
      try{
        var c=document.createElement('canvas');
        var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
        if(!gl) return {renderer:'n/a',vendor:'n/a',hash:hash('none'),version:'—',shading:'—',maxTex:'—',ext:0};
        var dbg=gl.getExtension('WEBGL_debug_renderer_info');
        var r=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
        var v=dbg?gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR);
        return {
          renderer:r, vendor:v, hash:hash(r+'|'+v),
          version: gl.getParameter(gl.VERSION) || '—',
          shading: gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || '—',
          maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) || '—',
          ext: gl.getSupportedExtensions ? gl.getSupportedExtensions().length : 0
        };
      }catch(e){ return {renderer:'n/a',vendor:'n/a',hash:'n/a',version:'—',shading:'—',maxTex:'—',ext:0}; }
    }

    // ===== 全访客统计后端（需自行部署 Cloudflare Worker，见 worker.js）=====
    var WORKER = 'https://linsonghuu-visitors.linsonghuu.workers.dev';   // 访客统计后端（Cloudflare Worker）
    var READ_SECRET = 'YQ03A-gdiDtPPZeQ4xVrCF0DrXz29aVX';   // 与 Worker 环境变量一致，用于站长拉取全量访客
    var SNAP_URL = 'visitors.json';   // 同源兜底快照（github.io 在中国可直连；Worker 拉不到时回退到它）
    var diagVisitors = [], diagSort = 'recent', diagSearch = '', diagExplain = false, diagFilter = 'all';

    function computeFp(){
      var ua = navigator.userAgent;
      var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '—';
      var cfp = canvasFP();
      var w = webglInfo();
      var tz = (function(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone; }catch(e){ return '—'; } })();
      var lang = (navigator.languages && navigator.languages.join(', ')) || navigator.language || '—';
      var cores = navigator.hardwareConcurrency || '—';
      var mem = navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '—';
      var raw = [ua, plat, cfp, w.hash, screen.width+'x'+screen.height, window.devicePixelRatio, tz, lang, cores, mem].join('|');
      return { id:(hash(raw)+'00000000').slice(0,8), gpu:w.renderer, w:w, cfp:cfp };
    }

    function esc(x){ return String(x==null?'':x).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
    function relTime(ts){
      if(!ts) return '—';
      var s = Math.floor((Date.now()-ts)/1000);
      if(s<60) return s+'s 前';
      if(s<3600) return Math.floor(s/60)+'m 前';
      if(s<86400) return Math.floor(s/3600)+'h 前';
      return Math.floor(s/86400)+'d 前';
    }
    function fmt(ts){ if(!ts) return '—'; try{ return new Date(ts).toLocaleString('zh-CN',{hour12:false}); }catch(e){ return String(ts); } }
    var BOT_UA = /bot|crawl|spider|slurp|headless|python-requests|curl|wget|go-http|java\/|okhttp|scrapy|phantom|selenium|puppeteer|playwright|axios|httpclient|python-urllib/i;
    function botVerdict(v){
      if(v && v.verdict) return v.verdict;            // 'human' | 'bot' | 'auto'
      return BOT_UA.test((v && v.ua || '').toLowerCase()) ? 'bot' : 'human';
    }
    function verdictView(v){
      var k = botVerdict(v);
      if(k==='auto') return {cls:'bad', txt:'机器/自动化'};
      if(k==='bot')  return {cls:'warn', txt:'疑似机器人'};
      return {cls:'ok', txt:'真人'};
    }
    function vrow(k,val){ return '<div class="vrow" title="'+(EXP[k]||'')+'"><span class="kl">'+k+'</span><span class="vv">'+val+'</span></div>'; }
    var EXP = {
      'User Agent':'浏览器自报的“身份字符串”，含系统/浏览器/版本与渲染引擎。任何人都可伪造，只能参考。',
      '平台 / Platform':'操作系统平台，如 Win32 / MacIntel / Linux x86_64。',
      'UA Client Hints':'新版 UA 的精简字段（浏览器/系统/机型），更难被随意伪造。',
      '厂商 / Vendor':'浏览器内核厂商（多为 Google / Apple / 其它）。',
      '语言 / Languages':'界面与首选语言列表，可粗略推断地区。',
      '时区 / Timezone':'系统时区（如 Asia/Shanghai）与相对 UTC 偏移，结合语言可推测国家。',
      '本地时间':'访客设备当前时间，与时区交叉验证城市。',
      '网络状态':'设备当前是否联网。',
      'CPU 核心数':'navigator.hardwareConcurrency，逻辑核心数，粗略判断设备档次。',
      '内存 / Device Memory':'navigator.deviceMemory（GB），是约数且可被浏览器隐藏。',
      '最大触摸点':'navigator.maxTouchPoints，触屏支持点数，0 多为桌面。',
      '指针类型':'精确（鼠标）或粗略（触摸），区分桌面与移动端。',
      '是否自动化':'navigator.webdriver 为 true 表示由脚本/无头浏览器驱动（机器人/爬虫/自动化测试），真人浏览器通常为 false。',
      'Do Not Track':'用户是否开启“请勿追踪”，仅表达意愿、网站可不遵守。',
      'Global Privacy Ctrl':'GPC 信号，表达“拒绝被出售数据”的意愿，仅部分网站遵守。',
      'Cookie 启用':'浏览器是否启用 Cookie，关掉会影响登录态与会话。',
      'JS 堆内存':'performance.memory 的内存占用，仅 Chromium 提供。',
      '分辨率':'屏幕物理像素分辨率（宽 × 高）。',
      '可用区域':'扣除任务栏后的可工作区域。',
      '像素比 DPR':'设备像素比，越大屏幕越清晰（Retina 多为 2~3）。',
      '色彩深度':'每像素位数，主流 24bit；异常值可能是伪装或虚拟机。',
      '窗口大小':'当前浏览器窗口尺寸。',
      '屏幕方向':'横屏 / 竖屏。',
      '连接类型':'effectiveType，网络类型（4g/3g/wifi 等），基于测速估算。',
      '下行速度':'navigator.connection.downlink，估算下行带宽（Mbps）。',
      'RTT 延迟':'往返时延（毫秒），越小越快。',
      '省流量模式':'是否开启 Data Saver。',
      'IP 地址':'访客公网 IP，由 Cloudflare 边缘提供，属个人信息，仅站长可见。',
      '地理位置':'由 IP 反查的大致城市与国家，精度到城市级，非精确定位。',
      '运营商 / ISP':'IP 归属的网络运营商（如电信/联通/某云厂商）。',
      '复合指纹 ID':'把多项哈希拼合并再哈希得到的 8 位短 ID，稳定标识“这台设备”，不依赖 Cookie。',
      'Canvas 指纹':'文字/图形画到 Canvas 后取像素哈希，不同设备渲染结果不同，是稳定的匿名追踪 ID 来源。',
      'WebGL 指纹':'读取 GPU 与驱动信息的哈希，硬件越独特越易区分。',
      'GPU 渲染器':'WebGL 报告的显卡渲染器名称，可识别具体显卡。',
      'GPU 厂商':'显卡厂商（Apple / Intel / NVIDIA 等）。',
      'WebGL 版本':'WebGL 规范版本（1.0 / 2.0）。',
      '着色器版本':'着色器语言版本（GLSL），随驱动变化。',
      '最大纹理':'GPU 支持的最大纹理尺寸，不同硬件差异明显。',
      '扩展数量':'WebGL 扩展个数，作为指纹补充维度。',
      'GPU':'WebGL 报告的显卡型号，可识别具体硬件。',
      '平台':'访客的操作系统平台。',
      '城市':'由 IP 反查的大致城市。',
      'IP':'访客公网 IP，属个人信息，仅站长可见。',
      'UA':'浏览器自报的身份字符串，含系统/浏览器/版本。',
      '访问次数':'该指纹累计访问本站的次数。',
      '首见':'该访客第一次出现的绝对时间。',
      '最近':'该访客最后一次出现的绝对时间。'
    };
    function reportVisit(fpId, ua, plat, gpu, webdriver){
      if(!WORKER) return;
      try{
        fetch(WORKER + '/visit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fp:fpId, ua:ua, platform:plat, gpu:gpu, webdriver:!!webdriver }) }).catch(function(){});
      }catch(e){}
    }
    function loadAllVisitors(){
      var box = document.getElementById('vList');
      if(!box) return;
      if(!WORKER){ return loadFromSnap(box, '未配置后端（WORKER 为空）'); }
      box.innerHTML = '<span class="muted">加载中…</span>';
      fetch(WORKER + '/visits?secret=' + encodeURIComponent(READ_SECRET || ''))
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(!d || !d.ok){ return loadFromSnap(box, '拉取失败：' + esc(d && d.err)); }
          applyVisitorData(d, 'live');
        })
        .catch(function(){ return loadFromSnap(box, '网络错误（国内可能需梯子）'); });
    }
    // Worker 不可达时，回退到同源静态快照 visitors.json（github.io 在中国可直连）
    function loadFromSnap(box, reason){
      if(!box) box = document.getElementById('vList');
      fetch(SNAP_URL + '?t=' + Date.now())
        .then(function(r){ return r.ok ? r.json() : Promise.reject(); })
        .then(function(d){
          if(!d || !d.ok){ box.innerHTML = '<span class="muted">' + (reason||'') + '，且无本地快照</span>'; setSnap('—'); return; }
          applyVisitorData(d, 'snap', reason);
        })
        .catch(function(){ box.innerHTML = '<span class="muted">' + (reason||'') + '，且无本地快照</span>'; setSnap('—'); });
    }
    function applyVisitorData(d, mode, reason){
      diagVisitors = d.visitors || [];
      var bots = diagVisitors.filter(function(v){ return botVerdict(v)!=='human'; }).length;
      var st = document.getElementById('vStat');
      if(st) st.innerHTML = '<span class="chip"><b>'+(d.total||0)+'</b> 总访问</span><span class="chip"><b>'+(d.unique||0)+'</b> 独立访客</span><span class="chip'+(bots?' warn':'')+'"><b>'+bots+'</b> 机器人</span>';
      var bd = document.getElementById('diagBadge');
      if(bd) bd.textContent = (d.unique||0) + ' 位访客';
      setSnap(mode==='snap' ? ('快照 · 同步于 ' + (d.syncedAt ? fmt(d.syncedAt) : '未知') + (reason ? '（' + reason + '）' : '')) : '实时');
      renderVisitors();
    }
    function setSnap(txt){
      var el = document.getElementById('vSnap');
      if(el){ el.textContent = txt || ''; el.classList.toggle('warn', /快照/.test(txt||'')); }
    }
    function renderVisitors(){
      var box = document.getElementById('vList'); if(!box) return;
      var sort = diagSort, q = (diagSearch||'').trim().toLowerCase();
      var list = diagVisitors.slice();
      if(q){
        list = list.filter(function(v){
          return [v.fp, v.gpu, v.city, v.ua, v.platform].filter(Boolean).some(function(s){ return s.toLowerCase().indexOf(q)>=0; });
        });
      }
      if(diagFilter!=='all'){
        list = list.filter(function(v){
          var k = botVerdict(v);
          return diagFilter==='bot' ? (k!=='human') : (k==='human');
        });
      }
      if(sort==='count') list.sort(function(a,b){ return (b.count||0)-(a.count||0) || (b.last||0)-(a.last||0); });
      else list.sort(function(a,b){ return (b.last||0)-(a.last||0); });
      if(!list.length){ box.innerHTML = '<span class="muted">' + (diagVisitors.length? '无匹配结果' : '暂无访客') + '</span>'; return; }
      var html = '';
      list.forEach(function(v){
        var cnt = v.count||1;
        var vv = verdictView(v);
        var fp = esc(v.fp);
        if(diagExplain){
          html += '<div class="vcard det"><div class="vtop"><span class="vid">'+fp+'</span>'
                + '<span class="vright"><span class="vtag '+vv.cls+'">'+vv.txt+'</span><span class="vc">×'+cnt+'</span></span></div>'
                + '<div class="vmeta det">'
                + vrow('GPU', esc(v.gpu||'—')) + vrow('平台', esc(v.platform||'—'))
                + vrow('城市', esc(v.city||'—')) + vrow('IP', esc(v.ip||'—'))
                + vrow('UA', esc(v.ua||'—')) + vrow('首见', fmt(v.first)+' · '+relTime(v.first))
                + vrow('最近', fmt(v.last)+' · '+relTime(v.last)) + vrow('访问次数', cnt)
                + '</div>'
                + '<div class="vp-entry"><button type="button" class="vparse-btn" data-fp="'+fp+'">详细解析</button></div>'
                + '<div class="vparse" data-fp="'+fp+'"></div>'
                + (getGA() ? vadmrow(v.fp, v.note) : '') + '</div>';
        } else {
          var city = v.city ? ' · ' + v.city : '';
          var ip = v.ip ? ' · ' + v.ip : '';
          var gpu = v.gpu||''; var ua = v.ua||'';
          html += '<div class="vcard"><div class="vtop"><span class="vid">'+fp+'</span>'
                + '<span class="vright"><span class="vtag '+vv.cls+'">'+vv.txt+'</span><span class="vc">×'+cnt+'</span></span></div>'
                + '<div class="vmeta"><span class="ml1">'+esc(gpu)+esc(city)+esc(ip)+'</span>'
                + '<span class="ml2">'+esc(ua)+'</span>'
                + '<span class="ml3">最近 '+relTime(v.last)+' · 首见 '+relTime(v.first)+'</span></div>'
                + '<div class="vp-entry"><button type="button" class="vparse-btn" data-fp="'+fp+'">详细解析</button></div>'
                + '<div class="vparse" data-fp="'+fp+'"></div>'
                + (getGA() ? vadmrow(v.fp, v.note) : '') + '</div>';
        }
      });
      box.innerHTML = html;
    }

    // 「详细解析」：事件委托 + 懒渲染（点开时才解析，避免每次重排都跑一遍）
    (function(){
      var vlist = document.getElementById('vList');
      if(!vlist) return;
      vlist.addEventListener('click', function(e){
        var btn = e.target.closest('.vparse-btn');
        if(btn){
          e.stopPropagation();
          var fp = btn.getAttribute('data-fp');
          var card = btn.closest('.vcard');
          var box = card ? card.querySelector('.vparse') : null;
          if(!box) return;
          if(box.classList.contains('open')){
            box.classList.remove('open'); btn.classList.remove('on'); btn.textContent = '详细解析';
          } else {
            var openBox = function(){
              box.classList.add('open'); btn.classList.add('on'); btn.textContent = '收起解析';
            };
            if(box.getAttribute('data-done')){ openBox(); return; }
            var v = null;
            for(var i=0;i<diagVisitors.length;i++){ if(diagVisitors[i].fp === fp){ v = diagVisitors[i]; break; } }
            var paint = function(){
              box.innerHTML = (window.VisitorParse && v) ? window.VisitorParse.render(v) : '<div class="vp-sec"><div class="vp-h">解析不可用</div><p class="vp-overview">解析模块加载失败，请刷新页面重试。</p></div>';
              box.setAttribute('data-done','1');
              openBox();
            };
            if(!v || window.VisitorParse){ paint(); }
            else { box.innerHTML = '<div class="c-loading">解析模块加载中…</div>'; ensureParser(paint); }
          }
          return;
        }
        var cp = e.target.closest('.vp-copy');
        if(cp){
          e.stopPropagation();
          var blk = cp.closest('.vp-raw-block');
          var pre = blk ? blk.querySelector('pre') : null;
          var txt = pre ? pre.textContent : '';
          var ok = function(){ cp.textContent = '已复制'; setTimeout(function(){ cp.textContent = '复制'; }, 1200); };
          if(navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(txt).then(ok).catch(function(){});
          } else {
            var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); ok(); }catch(err){} ta.remove();
          }
        }
      });
    })();

    /* ── 站长：访客备注 + 合并（仅在本机存了 ADMIN_TOKEN 时显示）── */
    function getGA(){ try{ return localStorage.getItem('gadmin-token') || ''; }catch(e){ return ''; } }
    function vadmrow(fp, note){
      return '<div class="vadmrow"><input class="vnote" data-fp="'+esc(fp)+'" value="'+esc(note||'')+'" placeholder="备注（如昵称/身份）…" maxlength="120">'
           + '<button class="vmg" data-fp="'+esc(fp)+'" title="作为合并来源">并入→</button>'
           + '<button class="vdel" data-fp="'+esc(fp)+'" title="删除该访客记录（含备注）">删除</button></div>';
    }
    function saveNote(fp, note){
      var tok = getGA(); if(!tok) return;
      fetch(WORKER + '/admin/note?token=' + encodeURIComponent(tok), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fp:fp, note:note }) })
        .then(function(r){ return r.json(); })
        .then(function(d){ if(d && d.ok){ diagVisitors.forEach(function(v){ if(v.fp===fp) v.note = note.trim(); }); setSnap('备注已保存 · '+fp); } else setSnap('备注保存失败'); })
        .catch(function(){ setSnap('备注保存失败'); });
    }
    function doMerge(){
      var tok = getGA(); if(!tok){ setSnap('先填写站长令牌'); return; }
      var from = (document.getElementById('vaFrom')||{}).value || ''; from = from.trim();
      var into = (document.getElementById('vaInto')||{}).value || ''; into = into.trim();
      var msg = document.getElementById('vaMsg');
      if(!from || !into || from===into){ if(msg) msg.textContent='请填两个不同的指纹'; return; }
      if(msg) msg.textContent='合并中…';
      fetch(WORKER + '/admin/merge?token=' + encodeURIComponent(tok), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from:from, into:into }) })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d && d.ok){ if(msg) msg.textContent='已合并，累计 '+(d.mergedCount||0)+' 次'; loadAllVisitors(); }
          else if(d && d.err==='note_conflict'){ if(msg) msg.textContent='备注冲突：【'+d.notes[0]+'】|【'+d.notes[1]+'】—— 请把来源备注改成与目标一致后重试'; }
          else { if(msg) msg.textContent='失败：'+(d && d.err || '网络'); }
        })
        .catch(function(){ if(msg) msg.textContent='网络错误'; });
    }
    function deleteVisitor(fp){
      var tok = getGA(); if(!tok){ setSnap('先填写站长令牌'); return; }
      if(!confirm('确定删除该访客记录（含备注）？此操作不可恢复。')) return;
      setSnap('删除中… ' + fp);
      fetch(WORKER + '/admin/delete?token=' + encodeURIComponent(tok), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fp:fp }) })
        .then(function(r){ return r.json(); })
        .then(function(d){ if(d && d.ok){ setSnap('已删除 ' + fp); loadAllVisitors(); } else setSnap('删除失败：' + ((d&&d.err)||'未知')); })
        .catch(function(){ setSnap('删除失败（网络）'); });
    }
    (function wireAdmin(){
      var g = document.getElementById('gAll'); if(!g) return;
      var tok = document.getElementById('vaTok'); if(tok && getGA()) tok.value = getGA();
      if(tok) tok.addEventListener('change', function(){ try{ localStorage.setItem('gadmin-token', tok.value.trim()); }catch(e){} renderVisitors(); });
      g.addEventListener('click', function(e){
        var mg=e.target.closest('.vmg'); if(mg){ var f=mg.getAttribute('data-fp'); var from=document.getElementById('vaFrom'); if(from){ from.value=f; from.focus(); } return; }
        var dl=e.target.closest('.vdel'); if(dl){ if(confirm('确定删除该访客记录（含备注）？此操作不可恢复。')) deleteVisitor(dl.getAttribute('data-fp')); }
      });
      g.addEventListener('change', function(e){ if(e.target.classList && e.target.classList.contains('vnote')) saveNote(e.target.getAttribute('data-fp'), e.target.value); });
      g.addEventListener('keydown', function(e){ if(e.target.classList && e.target.classList.contains('vnote') && e.key==='Enter'){ e.preventDefault(); saveNote(e.target.getAttribute('data-fp'), e.target.value); e.target.blur(); } });
      var mb = document.getElementById('vaMerge'); if(mb) mb.addEventListener('click', doMerge);
      var cb = document.getElementById('vaClear'); if(cb) cb.addEventListener('click', function(){
        if(!getGA()){ setSnap('先填写站长令牌'); return; }
        if(!confirm('确定清空全部访客记录与备注？此操作不可恢复。')) return;
        setSnap('清空中…');
        fetch(WORKER + '/admin/clear?token=' + encodeURIComponent(getGA()), { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
          .then(function(r){ return r.json(); })
          .then(function(d){ if(d && d.ok){ setSnap('已清空全部访客'); loadAllVisitors(); } else setSnap('清空失败：' + ((d&&d.err)||'未知')); })
          .catch(function(){ setSnap('清空失败（网络）'); });
      });
    })();

    function collect(){
      var gi=document.getElementById('gIdentity');
      var gh=document.getElementById('gHardware');
      var gs=document.getElementById('gScreen');
      var gn=document.getElementById('gNetwork');
      var gf=document.getElementById('gFinger');
      [gi,gh,gs,gn,gf].forEach(function(g){ g.innerHTML=''; });

      var ua = navigator.userAgent;
      var uaData = navigator.userAgentData;
      var brands = (uaData && uaData.brands) ? uaData.brands.map(function(b){ return b.brand + ' ' + b.version; }).join(', ') : '—';
      var plat = (uaData && uaData.platform) || navigator.platform || '—';
      var lang = (navigator.languages && navigator.languages.join(', ')) || navigator.language || '—';
      var tz = (function(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone; }catch(e){ return '—'; } })();
      var off = -new Date().getTimezoneOffset()/60;
      var online = navigator.onLine ? '在线' : '离线';
      row(gi,'User Agent', ua);
      row(gi,'平台 / Platform', plat);
      row(gi,'UA Client Hints', brands);
      row(gi,'厂商 / Vendor', navigator.vendor || '—');
      row(gi,'语言 / Languages', lang);
      row(gi,'时区 / Timezone', tz + '  (UTC' + (off>=0?'+':'') + off + ')');
      row(gi,'本地时间', new Date().toLocaleString());
      row(gi,'网络状态', online);

      var cores = navigator.hardwareConcurrency || '—';
      var mem = navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '—';
      var touch = navigator.maxTouchPoints || 0;
      var pointer = matchMedia('(pointer:fine)').matches ? '精确（鼠标）' : (matchMedia('(pointer:coarse)').matches ? '粗略（触摸）' : '—');
      var dnt = navigator.doNotTrack==='1' || window.doNotTrack==='1' ? '开启' : '未开启 / 未知';
      var heap = (performance && performance.memory && performance.memory.usedJSHeapSize) ? (performance.memory.usedJSHeapSize/1048576).toFixed(1)+' MB' : '—';
      row(gh,'CPU 核心数', cores);
      row(gh,'内存 / Device Memory', mem);
      row(gh,'最大触摸点', touch);
      row(gh,'指针类型', pointer);
      row(gh,'是否自动化', navigator.webdriver ? '是（疑似爬虫/自动化）' : '否');
      row(gh,'Do Not Track', dnt);
      row(gh,'Global Privacy Ctrl', navigator.globalPrivacyControl ? '开启' : '未开启');
      row(gh,'Cookie 启用', navigator.cookieEnabled ? '是' : '否');
      row(gh,'JS 堆内存', heap);

      row(gs,'分辨率', screen.width + ' × ' + screen.height);
      row(gs,'可用区域', screen.availWidth + ' × ' + screen.availHeight);
      row(gs,'像素比 DPR', window.devicePixelRatio);
      row(gs,'色彩深度', screen.colorDepth + ' bit');
      row(gs,'窗口大小', window.innerWidth + ' × ' + window.innerHeight);
      row(gs,'屏幕方向', screen.orientation ? screen.orientation.type : '—');

      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      row(gn,'连接类型', conn ? (conn.effectiveType || conn.type || '—') : '—');
      row(gn,'下行速度', conn && conn.downlink ? conn.downlink + ' Mbps' : '—');
      row(gn,'RTT 延迟', conn && conn.rtt ? conn.rtt + ' ms' : '—');
      row(gn,'省流量模式', conn && conn.saveData ? '开启' : '—');
      row(gn,'IP 地址', '查询中…');
      row(gn,'地理位置', '查询中…');
      row(gn,'运营商 / ISP', '查询中…');

      var fp = computeFp();
      var w = fp.w;
      var fpId = fp.id;
      var fpDisp = fpId.slice(0,4).toUpperCase() + ' ' + fpId.slice(4,8).toUpperCase();
      document.getElementById('fpId').textContent = fpDisp;
      row(gf,'复合指纹 ID', fpDisp);
      row(gf,'Canvas 指纹', fp.cfp);
      row(gf,'WebGL 指纹', w.hash);
      row(gf,'GPU 渲染器', w.renderer);
      row(gf,'GPU 厂商', w.vendor);
      row(gf,'WebGL 版本', w.version);
      row(gf,'着色器版本', w.shading);
      row(gf,'最大纹理', w.maxTex);
      row(gf,'扩展数量', w.ext);
      loadAllVisitors();

      // 无权限、非定位的 IP 地理查询（仅读取网络层信息，不弹任何授权）
      // 主用 ipwho.is，失败回退 ipinfo.io，二者均开启 CORS
      var netRows = gn.querySelectorAll('.row');
      function setNet(label, val){
        netRows.forEach(function(r){
          var b = r.querySelector('b');
          if(b && b.textContent===label){ r.querySelector('span').textContent = (val||'—'); }
        });
      }
      function fillGeo(d){
        setNet('IP 地址', d.ip);
        setNet('地理位置', [d.city, d.region, d.country].filter(Boolean).join(' · '));
        setNet('运营商 / ISP', d.isp || d.org || '—');
      }
      var geoSources = [
        function(){ return fetch('https://ipwho.is/').then(function(r){ return r.ok?r.json():Promise.reject(); }).then(function(d){ if(d.success===false) return Promise.reject(); return {ip:d.ip,city:d.city,region:d.region,country:d.country,isp:(d.connection&&(d.connection.org||d.connection.isp))||d.org}; }); },
        function(){ return fetch('https://ipinfo.io/json').then(function(r){ return r.ok?r.json():Promise.reject(); }).then(function(d){ return {ip:d.ip,city:d.city,region:d.region,country:d.country,isp:d.org}; }); }
      ];
      (function next(i){
        if(i>=geoSources.length) return;
        geoSources[i]().then(fillGeo).catch(function(){ next(i+1); });
      })(0);
    }

    // 解析模块按需加载：只有打开 diag 面板 / 点「详细解析」时才拉 visitor-parse.js（约 40KB）
    var parserLoading=false, parserQueue=[];
    function ensureParser(cb){
      if(window.VisitorParse){ if(cb) cb(); return; }
      if(cb) parserQueue.push(cb);
      if(parserLoading) return;
      parserLoading=true;
      var s=document.createElement('script');
      s.src='/visitor-parse.js';
      s.onload=s.onerror=function(){
        parserLoading=false;
        var q=parserQueue.slice(); parserQueue=[];
        for(var i=0;i<q.length;i++){ try{ q[i](); }catch(e){} }
      };
      document.head.appendChild(s);
    }
    function openDiag(){ ensureParser(); collect(); diag.classList.add('show'); diag.setAttribute('aria-hidden','false'); }
    function closeDiag(){ diag.classList.remove('show'); diag.setAttribute('aria-hidden','true'); }
    function toggleDiag(){ diag.classList.contains('show') ? closeDiag() : openDiag(); }

    function copyReport(){
      var lines = ['=== 访客信息 Visitor Info ===', '指纹 ID: ' + document.getElementById('fpId').textContent];
      document.querySelectorAll('#diag .grp').forEach(function(g){
        var t = g.querySelector('.gt'); if(!t) return;
        lines.push('\n[' + t.textContent + ']');
        g.querySelectorAll('.row').forEach(function(r){
          var b=r.querySelector('b'), s=r.querySelector('span');
          if(b&&s) lines.push('  ' + b.textContent + ': ' + s.textContent);
        });
      });
      var text = lines.join('\n');
      function flash(){
        var btn=document.getElementById('diagCopy');
        btn.textContent='✓ 已复制'; btn.classList.add('done');
        setTimeout(function(){ btn.textContent='⧉ 复制全部'; btn.classList.remove('done'); }, 1400);
      }
      function fallback(){
        try{
          var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); flash();
        }catch(e){}
      }
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(flash, function(){ fallback(); });
      } else { fallback(); }
    }

    document.getElementById('diagClose').addEventListener('click', closeDiag);
    document.getElementById('diagRefresh').addEventListener('click', collect);
    document.getElementById('diagCopy').addEventListener('click', copyReport);
    diag.addEventListener('click', function(e){ if(e.target===diag) closeDiag(); });
    (function(){
      var seg = document.getElementById('vSort');
      if(seg) seg.addEventListener('click', function(e){
        var b = e.target.closest('button'); if(!b) return;
        diagSort = b.getAttribute('data-sort') || 'recent';
        seg.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
        renderVisitors();
      });
      var si = document.getElementById('vSearch');
      if(si) si.addEventListener('input', function(e){ diagSearch = e.target.value || ''; renderVisitors(); });
      var vseg = document.getElementById('vVerdict');
      if(vseg) vseg.addEventListener('click', function(e){
        var b = e.target.closest('button'); if(!b) return;
        diagFilter = b.getAttribute('data-v') || 'all';
        vseg.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x===b); });
        renderVisitors();
      });
      var ex = document.getElementById('diagExplain');
      if(ex) ex.addEventListener('click', function(){
        diagExplain = !diagExplain;
        diag.classList.toggle('explain', diagExplain);
        ex.classList.toggle('on', diagExplain);
        ex.textContent = diagExplain ? '收起' : '说明';
        renderVisitors();
      });
    })();

    // 每次页面加载即上报当前访客（无论是否打开面板）——只有配置了后端才生效
    (function reportOnLoad(){
      if(!WORKER) return;
      try{
        var f = computeFp();
        var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '—';
        reportVisit(f.id, navigator.userAgent, plat, f.gpu, navigator.webdriver === true);
      }catch(e){}
    })();
  // 供 bootstrap 调用：force="close" 强制关闭，否则切换开/关
  window.DiagToggle = function(force){
    if (force === "close") { closeDiag(); return; }
    toggleDiag();
  };
  }catch(e){}
})();
