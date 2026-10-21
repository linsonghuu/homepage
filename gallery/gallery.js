/* Gallery 公共交互：瀑布流首页 + 独立图页 + Lightbox + 评论区。
   图片保护：只展示处理后的 display 图，无下载/查看原图入口；禁右键/拖拽(user-select)。
   SPA 适配：页面类型由 #view.dataset.page 判定；通过 spa:navigate 事件重新初始化。 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var WORKER = 'https://linsonghuu-visitors.linsonghuu.workers.dev';
  var DATA = []; var VIEW = [];
  var st = { cat: 'All', q: '', tag: '' };
  var protectDone = false;
  var bootedFor = null;
  function getPage(){
    var v = document.getElementById('view');
    if (v && v.dataset && v.dataset.page) return v.dataset.page;
    if (document.body.classList.contains('photo-page')) return 'photo';
    if (document.body.classList.contains('gallery-page')) return 'gallery';
    return '';
  }
  function isPhoto(){ return getPage() === 'photo'; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function relTime(ts){ if(!ts) return ''; var s=Math.floor((Date.now()-ts)/1000); if(s<60)return s+'s ago'; if(s<3600)return Math.floor(s/60)+'m ago'; if(s<86400)return Math.floor(s/3600)+'h ago'; if(s<86400*30)return Math.floor(s/86400)+'d ago'; return new Date(ts).toLocaleDateString('zh-CN'); }
  function fp(){ try{ var f=localStorage.getItem('home-fp'); if(!f){ f=(Math.random().toString(16).slice(2,10)); localStorage.setItem('home-fp',f);} return f; }catch(e){ return 'anon'; } }
  // 站长令牌：后台页存 sessionStorage，diag 面板存 localStorage；两者任一存在即显示「删除」
  function adminTok(){
    try { return sessionStorage.getItem('admin-token') || localStorage.getItem('gadmin-token') || ''; } catch(e){ return ''; }
  }

  function load() {
    // 静态图集 + 站长在后台改过的文案（KV 覆盖），合并后再渲染
    return Promise.all([
      fetch('/gallery/gallery.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return { items: [] }; }),
      fetch(WORKER + '/gallery-meta', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      var j = res[0], m = res[1];
      DATA = (j && j.items) || [];
      var map = (m && m.ok && m.meta) || {};
      DATA.forEach(function (it) {
        var o = map[it.id]; if (!o) return;
        if (o.title) it.title = o.title;
        if (o.desc != null && o.desc !== '') it.description = o.desc;
        if (o.category) it.category = o.category;
        if (o.tags && o.tags.length) it.tags = o.tags;
        if (o.date) it.date = o.date;
      });
      return DATA;
    }).catch(function () { DATA = []; return DATA; });
  }

  // ---- 图片辅助防护：禁右键 / 禁拖拽 / 禁选中 ----
  // 说明：user-drag / user-select 样式统一放在 gallery.css，避免运行时往 head 注入 <style>。
  function protect() {
    if (protectDone) return; protectDone = true;
    document.addEventListener('contextmenu', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    });
    document.addEventListener('dragstart', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    });
  }

  var LB = (function () {
    var root = null, stage, img, count, title, meta, desc, cur = [], idx = 0, built = false;
    var scale=1, tx=0, ty=0, pointers={}, pinchStart=null, panning=false, panStart=null;
    function ensureBuilt() {
      if (built) return;
      built = true;
      root = document.createElement('div');
      root.className = 'lb'; root.id = 'galleryLB'; root.setAttribute('role','dialog');
      root.innerHTML =
        '<div class="lb-top"><span class="lb-count" id="lbCount"></span>' +
        '<button class="lb-btn" id="lbCmt">Comments</button>' +
        '<button class="lb-btn" id="lbShare">Share</button>' +
        '<button class="lb-btn icon" id="lbClose" aria-label="Close">x</button></div>' +
        '<div class="lb-stage" id="lbStage"><img id="lbImg" alt="">' +
        '<button class="lb-arrow prev" id="lbPrev">&lsaquo;</button>' +
        '<button class="lb-arrow next" id="lbNext">&rsaquo;</button></div>' +
        '<div class="lb-cap"><div class="c1"><span class="ct" id="lbTitle"></span><span class="cm" id="lbMeta"></span></div>' +
        '<div class="cd" id="lbDesc"></div></div>';
      document.body.appendChild(root);
      stage=$('#lbStage'); img=$('#lbImg'); count=$('#lbCount'); title=$('#lbTitle'); meta=$('#lbMeta'); desc=$('#lbDesc');
      $('#lbClose').onclick=close; $('#lbPrev').onclick=function(e){e.stopPropagation();go(-1);};
      $('#lbNext').onclick=function(e){e.stopPropagation();go(1);};
      $('#lbShare').onclick=function(e){e.stopPropagation();share();};
      $('#lbCmt').onclick=function(e){e.stopPropagation();toComments();};
      stage.addEventListener('click',function(e){ if(e.target===img||e.target===stage) close(); });
      img.addEventListener('dblclick',function(){ scale>1?resetZoom():setZoom(2.2); });
      stage.addEventListener('wheel',function(e){ e.preventDefault(); if(e.ctrlKey||Math.abs(e.deltaY)>40) setZoom(scale*(e.deltaY<0?1.12:0.9)); },{passive:false});
      stage.addEventListener('pointerdown',onDown); stage.addEventListener('pointermove',onMove); stage.addEventListener('pointerup',onUp); stage.addEventListener('pointercancel',onUp);
    }
    function apply(){ img.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')'; stage.classList.toggle('zoomed',scale>1); }
    function setZoom(s){ scale=Math.max(1,Math.min(5,s)); if(scale===1){tx=ty=0;} apply(); }
    function resetZoom(){ scale=1; tx=ty=0; apply(); }
    function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
    function onDown(e){ pointers[e.pointerId]={x:e.clientX,y:e.clientY};
      if(Object.keys(pointers).length===2){ var k=Object.keys(pointers); pinchStart={d:dist(pointers[k[0]],pointers[k[1]]),s:scale}; panning=false; return; }
      panStart={x:e.clientX,y:e.clientY,tx:tx,ty:ty,t:Date.now()}; if(scale>1){panning=true; try{stage.setPointerCapture(e.pointerId);}catch(err){}} }
    function onMove(e){ if(pointers[e.pointerId]) pointers[e.pointerId]={x:e.clientX,y:e.clientY};
      if(pinchStart && Object.keys(pointers).length===2){ var k=Object.keys(pointers); setZoom(pinchStart.s*(dist(pointers[k[0]],pointers[k[1]])/pinchStart.d)); e.preventDefault(); return; }
      if(panning && panStart){ tx=panStart.tx+(e.clientX-panStart.x); ty=panStart.ty+(e.clientY-panStart.y); apply(); } }
    function onUp(e){ var moved=panStart?Math.hypot(e.clientX-panStart.x,e.clientY-panStart.y):0; var dt=panStart?Date.now()-panStart.t:0;
      delete pointers[e.pointerId]; if(pinchStart && Object.keys(pointers).length<2) pinchStart=null; panning=false;
      if(scale===1 && moved>60 && dt<500) go(e.clientX-panStart.x>0?-1:1); panStart=null; }
    function open(list,index){ ensureBuilt(); cur=list; idx=index; document.body.style.overflow='hidden';
      requestAnimationFrame(function(){ root.classList.add('show'); root.setAttribute('aria-hidden','false'); }); render(); }
    function render(){ var it=cur[idx]; resetZoom(); img.src=it.display||it.thumbnail; img.alt=it.title||'';
      count.textContent=(idx+1)+' / '+cur.length; title.textContent=it.title||'';
      meta.textContent=[it.category,it.date,(it.width?(it.width+' x '+it.height):'')].filter(Boolean).join('  ·  ');
      desc.textContent=it.description||''; desc.style.display=it.description?'':'none';
      var multi=cur.length>1; $('#lbPrev').style.display=$('#lbNext').style.display=multi?'':'none'; }
    function go(d){ if(!cur.length)return; idx=(idx+d+cur.length)%cur.length; render();
      if(isPhoto()) push(cur[idx]); }
    function share(){ var it=cur[idx]; var url=location.origin+'/gallery/'+it.id+'/';
      if(navigator.share){ navigator.share({title:(it.title||'Photo')+' · Gallery',text:it.title||'',url:url}).catch(function(){}); }
      else copy(url,'Link copied'); }
    function toComments(){ var id=cur[idx].id; close(); if(isPhoto()){ var el=document.getElementById('comments'); if(el) el.scrollIntoView({behavior:'smooth'}); } else if(window.SPA){ window.SPA.navigate('/gallery/'+id+'/#comments'); } else { location.href='/gallery/'+id+'/#comments'; } }
    function close(){ if(!root) return; root.classList.remove('show'); root.setAttribute('aria-hidden','true'); document.body.style.overflow=''; img.removeAttribute('src'); }
    // 离开 gallery/photo 页时销毁：Lightbox 挂在 body（#view 之外），其样式在 gallery.css；
    // 若不销毁，返回主页后 gallery.css 被 router 移除 → Lightbox 丢失 display:none 变成裸块。
    function destroy(){
      if(root && root.parentNode) root.parentNode.removeChild(root);
      root=null; built=false; stage=img=count=title=meta=desc=null; cur=[]; idx=0;
      document.body.style.overflow='';
    }
    function copy(t,m){ if(navigator.clipboard) navigator.clipboard.writeText(t).then(function(){toast(m);}).catch(function(){fb(t);toast(m);}); else {fb(t);toast(m);} }
    function fb(t){ var ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(e){} ta.remove(); }
    function toast(t){ var el=$('#lbToast'); if(!el){ el=document.createElement('div'); el.className='lb-toast'; el.id='lbToast'; document.body.appendChild(el);} el.textContent=t; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(function(){el.classList.remove('show');},1500); }
    function push(it){ history.replaceState(null,'','/gallery/'+it.id+'/?view=1'); if(window.paintPhoto) window.paintPhoto(it);
      document.title=(it.title||'Photo')+' · Gallery · linsong'; }
    return { open:open, close:close, go:go, toast:toast, destroy:destroy };
  })();
  document.addEventListener('keydown', function (e) {
    var lb=$('#galleryLB'); if(!lb || !lb.classList.contains('show')) return;
    if(e.key==='Escape') LB.close(); else if(e.key==='ArrowRight') LB.go(1); else if(e.key==='ArrowLeft') LB.go(-1);
  });

  // SPA 离开 gallery/photo 时销毁 Lightbox（它挂在 body 上，样式却在 gallery.css，留到主页会裸奔）
  window.addEventListener('spa:navigate', function (e) {
    var p = e.detail && e.detail.page;
    if (p !== 'gallery' && p !== 'photo') LB.destroy();
  });

  function initIndex() {
    var grid=$('#grid'), cats=$('#cats'), gcount=$('#gcount'), gsearch=$('#gsearch');
    var tag=new URLSearchParams(location.search).get('tag');
    function apply(){
      var list=DATA.filter(function(it){
        if(st.cat!=='All' && it.category!==st.cat) return false;
        if(st.tag && (it.tags||[]).indexOf(st.tag)<0 && it.id!==st.tag) return false;
        if(st.q){ var blob=[it.title,it.category,it.id,(it.tags||[]).join(' ')].join(' ').toLowerCase(); if(blob.indexOf(st.q.toLowerCase())<0) return false; }
        return true;
      });
      VIEW=list; renderCats(); renderGrid(list);
      if(gcount) gcount.textContent=list.length+' 张'+(list.length!==DATA.length?(' / '+DATA.length):'');
    }
    function renderCats(){ var set=['All']; DATA.forEach(function(it){ if(it.category && set.indexOf(it.category)<0) set.push(it.category); });
      cats.innerHTML=set.map(function(c){ return '<button class="cat'+(c===st.cat?' on':'')+'" data-cat="'+esc(c)+'">'+esc(c)+'</button>'; }).join(''); }
    function renderGrid(list){
      if(!list.length){ grid.innerHTML='<div class="empty">'+ (DATA.length?'没有匹配的图片':'还没有照片 · 去 gallery.json 添加或在管理后台上传') +'</div>'; return; }
      grid.innerHTML=list.map(function(it,i){
        var ar=it.width&&it.height?('aspect-ratio:'+it.width+'/'+it.height):'aspect-ratio:4/3';
        var ovm=[it.category,it.date,it.width?(it.width+'×'+it.height):''].filter(Boolean).join(' · ');
        return '<div class="card" data-i="'+i+'" role="button" tabindex="0" aria-label="'+esc(it.title||'')+'">'+
          '<div class="ph" style="'+ar+'"><img src="'+esc(it.thumbnail)+'" width="'+(it.width||'')+'" height="'+(it.height||'')+
          '" alt="'+esc(it.title||'')+'" loading="lazy" decoding="async"><div class="ov"><div class="ovt">'+esc(it.title||'')+'</div><div class="ovm">'+esc(ovm)+'</div></div></div></div>';
      }).join('');
      var imgs=grid.querySelectorAll('.card img');
      for(var j=0;j<imgs.length;j++){ (function(im){ function on(){im.classList.add('loaded');} if(im.complete)on(); else im.addEventListener('load',on); })(imgs[j]); }
    }
    cats.addEventListener('click',function(e){ var b=e.target.closest('.cat'); if(!b)return; st.cat=b.dataset.cat; st.tag=''; apply(); });
    if(gsearch) gsearch.addEventListener('input',function(){ st.q=gsearch.value.trim(); apply(); });
    grid.addEventListener('click',function(e){ var c=e.target.closest('.card'); if(!c)return; LB.open(VIEW,+c.dataset.i); });
    grid.addEventListener('keydown',function(e){ if(e.key!=='Enter'&&e.key!==' ')return; var c=e.target.closest('.card'); if(!c)return; e.preventDefault(); LB.open(VIEW,+c.dataset.i); });
    if(tag) st.tag=tag; apply();
  }

  var Cmt = (function () {
    var pid='', page=0, per=6, total=0, list=[];
    function fetchList(reset){
      if(reset){ page=0; list=[]; var b0=$('#cList'); if(b0) b0.innerHTML='<div class="c-loading">加载评论…</div>'; }
      // 加 t 参数 + no-store：避免删除后重新拉取仍命中浏览器/中间缓存，看到“删了还在”
      return fetch(WORKER+'/comments?photo='+encodeURIComponent(pid)+'&page='+page+'&size='+per+'&t='+Date.now(), { cache:'no-store' })
        .then(function(r){return r.json();})
        .then(function(d){
          if(!d||!d.ok) throw new Error('bad');
          total=d.total||0; (d.comments||[]).forEach(function(c){ list.push(c); });
          render();
        }).catch(function(){
          var box=$('#cList');
          if(box && !list.length) box.innerHTML='<div class="c-empty">评论加载失败（后端不可达，国内可能需要梯子）</div>';
        });
    }
    function node(text){ return document.createTextNode(text); }
    function linkify(text, parent){ // 安全：文本走 textContent，URL 仅 http/https 才转 <a>
      var frag=document.createDocumentFragment();
      var re=/(https?:\/\/[^\s]+)/g, last=0, m;
      while((m=re.exec(text))){
        if(m.index>last) frag.appendChild(node(text.slice(last,m.index)));
        var a=document.createElement('a'); a.href=m[0]; a.textContent=m[0]; a.target='_blank'; a.rel='noopener noreferrer nofollow';
        a.className='c-link'; frag.appendChild(a); last=re.lastIndex;
      }
      if(last<text.length) frag.appendChild(node(text.slice(last)));
      return frag;
    }
    // 站长删除：删一级评论时连同其回复一起删（回复是独立 KV 键，不删会留下孤儿数据）
    function delComment(c, btn){
      var tok = adminTok(); if(!tok) return;
      if(!confirm(c.parentId ? '删除这条回复？' : '删除这条评论？（其下的回复也会一起删除）')) return;
      btn.disabled = true; btn.textContent = '…';
      var ids = [c.id];
      if(!c.parentId){ list.forEach(function(x){ if(x.parentId === c.id) ids.push(x.id); }); }
      Promise.all(ids.map(function(id){
        return fetch(WORKER + '/admin/set?token=' + encodeURIComponent(tok), {
          method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store',
          // Worker 的删除分支只认 action:'delete'（status 白名单只有 hidden/pending/published）
          body: JSON.stringify({ photo: pid, id: id, action: 'delete', status: 'delete' })
        }).then(function(r){ return r.json(); }).catch(function(){ return { ok:false, err:'network' }; });
      })).then(function(rs){
        var bad = rs.filter(function(d){ return !d || !d.ok; });
        if(bad.length){
          btn.disabled = false; btn.textContent = '删除';
          var e = bad[0] && bad[0].err;
          LB.toast('删除失败：' + (e === 'forbidden' ? '令牌无效/无权限' : (e || '未知错误')));
          return;
        }
        // 回读校验：确认真的从后端消失了，避免“提示成功但其实没删”
        return fetchList(true).then(function(){
          var still = list.some(function(x){ return x.id === c.id; });
          LB.toast(still ? '删除未生效（请 Ctrl+F5 强刷后重试）' : '已删除');
        });
      });
    }
    function item(c){
      var el=document.createElement('div'); el.className='c-item'+(c.owner?' owner':'');
      var head=document.createElement('div'); head.className='c-head';
      var av=document.createElement('span'); av.className='c-av'; av.textContent=(c.author||'?').slice(0,1).toUpperCase();
      var au=document.createElement('span'); au.className='c-au'; au.textContent=c.author||'匿名';
      if(c.owner){ var b=document.createElement('span'); b.className='c-badge'; b.textContent='站长'; au.appendChild(b); }
      var tm=document.createElement('span'); tm.className='c-time'; tm.textContent=relTime(c.createdAt);
      head.appendChild(av); head.appendChild(au); head.appendChild(tm);
      // 仅当本机存有站长令牌时才出现「删除」（访客看不到）
      if(adminTok()){
        var del=document.createElement('button');
        del.type='button'; del.className='c-del'; del.textContent='删除';
        del.title='删除这条评论（仅站长可见）'; del.setAttribute('aria-label','删除这条评论');
        del.addEventListener('click', function(ev){ ev.stopPropagation(); delComment(c, del); });
        head.appendChild(del);
      }
      var body=document.createElement('div'); body.className='c-body';
      body.appendChild(linkify(String(c.content||'')));
      el.appendChild(head); el.appendChild(body);
      return el;
    }
    function render(){
      var box=$('#cList'); if(!box) return;
      var cnt=$('#cCount'); if(cnt) cnt.textContent=String(total);
      // 一次遍历分组（O(n²) → O(n)），并用 DocumentFragment 减少重排
      var tops=[], replies={};
      list.forEach(function(c){
        if(!c.parentId) tops.push(c);
        else (replies[c.parentId] = replies[c.parentId] || []).push(c);
      });
      var frag=document.createDocumentFragment();
      tops.forEach(function(c){
        frag.appendChild(item(c));
        (replies[c.id]||[]).forEach(function(r){ var el=item(r); el.classList.add('reply'); frag.appendChild(el); });
      });
      box.innerHTML=''; box.appendChild(frag);
      var more=$('#cMore');
      if(more){ var hasMore=list.length<total; more.hidden=!hasMore; more.textContent='Load more'; }
      if(total===0){ var em=document.createElement('div'); em.className='c-empty'; em.textContent='No comments yet — leave the first one.'; box.appendChild(em); }
    }
    function submit(name,text,hp){
      var msg=$('#cMsg'), btn=$('#cSubmit');
      if(hp){ if(msg){msg.textContent='Submitted';} return Promise.resolve(); } // 蜜罐命中：静默丢弃
      if(!name||!text.trim()){ if(msg) msg.textContent='Please fill name and comment.'; return Promise.resolve(); }
      btn.disabled=true; if(msg) msg.textContent='Sending…';
      return fetch(WORKER+'/comment',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({photo:pid, author:name, content:text, fp:fp(), honeypot:hp})})
        .then(function(r){return r.json();}).then(function(d){
          btn.disabled=false;
          if(d && d.ok){
            try { localStorage.setItem('comment-name', name); } catch(e){}   // 记住昵称，下次自动填
            if(d.status==='pending'){ if(msg) msg.textContent='Submitted — awaiting review.'; }
            else { if(msg) msg.textContent='Posted ✓'; }
            $('#cText').value=''; return fetchList(true);
          } else { if(msg) msg.textContent=(d&&d.err)||'Failed, try again.'; }
        }).catch(function(){ btn.disabled=false; if(msg) msg.textContent='Network error.'; });
    }
    function init(){
      var nameEl=$('#cName');
      try { var saved=localStorage.getItem('comment-name'); if(saved && nameEl && !nameEl.value) nameEl.value=saved; } catch(e){}
      var form=$('#cForm'); if(form) form.addEventListener('submit',function(e){ e.preventDefault();
        submit($('#cName').value.trim(), $('#cText').value, $('#cHoneypot').value); });
      var more=$('#cMore'); if(more) more.addEventListener('click',function(){
        if(more.disabled) return;
        more.disabled=true; page++;
        fetchList(false).then(function(){ more.disabled=false; });
      });
      load(document.body.dataset.photoId||'');
    }
    // 切换图片（Lightbox 上一张/下一张）时刷新评论区
    function load(photoId){
      pid = photoId || document.body.dataset.photoId || '';
      fetchList(true);
    }
    return { init:init, load:load };
  })();

  function initPhoto() {
    if (window.PHOTO && window.PHOTO.id) document.body.dataset.photoId = window.PHOTO.id;
    var list = DATA;
    var img = $('#photoImg');
    function res(x){ return x.width ? (x.width + ' × ' + x.height) : ''; }
    window.paintPhoto = function (x, noCmt) {
      document.body.dataset.photoId = x.id;
      if (!noCmt) Cmt.load(x.id);   // Lightbox 切图后同步刷新评论区（否则会停留在上一张的评论）
      img.src = x.display || x.thumbnail; img.alt = x.title || '';
      document.title = (x.title || 'Photo') + ' · Gallery · linsong';
      $('.p-title').textContent = x.title || '';
      $('.p-cat').textContent = x.category || '';
      $('.p-date').textContent = x.date || '';
      $('.p-res').textContent = res(x);
      var desc=$('.p-desc'); desc.textContent = x.description || ''; desc.style.display = x.description ? '' : 'none';
      var tg=$('.p-tags'); tg.innerHTML=''; (x.tags||[]).forEach(function(t){ var a=document.createElement('a'); a.className='tag'; a.href='/gallery/?tag='+encodeURIComponent(t); a.textContent='#'+t; tg.appendChild(a); });
      var i=list.indexOf(x), prevA=$('.p-nav .prev'), nextA=$('.p-nav .next');
      prevA.href='/gallery/'+list[(i-1+list.length)%list.length].id+'/';
      nextA.href='/gallery/'+list[(i+1)%list.length].id+'/';
    };
    function open(){ var cur=list.filter(function(x){return x.id===document.body.dataset.photoId;})[0]; LB.open(list, list.indexOf(cur)); }
    img.addEventListener('click', open); $('#openBtn').addEventListener('click', open); $('#zoomBtn').addEventListener('click', open);
    $('#shareBtn').addEventListener('click', function(){
      var url=location.href.split('?')[0];
      if(navigator.share) navigator.share({title:document.title,url:url}).catch(function(){});
      else { var ta=document.createElement('textarea'); ta.value=url; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(e){} ta.remove(); LB.toast('Link copied'); }
    });
    // 应用后台改过的文案（大标题 / 小标题 / 分类 / 标签 / 日期）；noCmt 避免与下面的 Cmt.init 重复请求
    var cur = DATA.filter(function(x){ return x.id === document.body.dataset.photoId; })[0];
    if (cur) paintPhoto(cur, true);
    Cmt.init();
    if (new URLSearchParams(location.search).get('view') === '1') open();
  }

  function boot() {
    var key = location.pathname + location.search;
    if (bootedFor === key) return;
    bootedFor = key;
    var p = getPage();
    if (p !== 'gallery' && p !== 'photo') return; // 仅 gallery / 照片页需要初始化
    load().then(function () {
      if (getPage() !== p) return; // 已离开该页（异步竞态），放弃初始化，避免对不存在的元素报错
      protect();
      if (p === 'photo') initPhoto(); else initIndex();
    });
  }

  // 直接加载（整页进入 gallery / 照片页）
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  // SPA 软导航进入 gallery / 照片页时重新初始化
  window.addEventListener('spa:navigate', function (e) {
    var p = e.detail && e.detail.page;
    if (p === 'gallery' || p === 'photo') boot();
  });

  window.Gallery = { boot: boot, LB: LB, Cmt: Cmt, getPage: getPage };
})();
