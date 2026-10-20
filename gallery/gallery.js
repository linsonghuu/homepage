/* Gallery —— 共享交互（瀑布流首页 + 独立图页 + Lightbox）。
   Lightbox：预览→原图两级；上/下一张；ESC/点遮罩关；←/→；移动端左右滑动；
   滚轮+双指+双击缩放/拖动；分享(Web Share→复制URL)；下载；查看原图。 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var isPhotoPage = document.body.classList.contains('photo-page');

  var DATA = [];               // 全部图片
  var VIEW = [];               // 当前过滤后列表（首页）
  var state = { cat: '全部', q: '', tag: '' };

  function load() {
    return fetch('/gallery/gallery.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (j) { DATA = (j && j.items) || []; return DATA; })
      .catch(function () { return []; });
  }

  /* ══════════════ Lightbox ══════════════ */
  var LB = (function () {
    var root, stage, img, count, title, meta, desc, toast, curList = [], idx = 0;
    var scale = 1, tx = 0, ty = 0, showingOrig = false;
    var pinchStart = null, pointers = {}, panning = false, panStart = null;

    function build() {
      root = document.createElement('div');
      root.className = 'lb'; root.id = 'galleryLB'; root.setAttribute('role', 'dialog');
      root.innerHTML =
        '<div class="lb-top">' +
        '<span class="lb-count" id="lbCount"></span>' +
        '<button class="lb-btn" id="lbOrig">⬆ 原图</button>' +
        '<button class="lb-btn" id="lbShare">↻ 分享</button>' +
        '<button class="lb-btn" id="lbDl">↓ 下载</button>' +
        '<button class="lb-btn icon" id="lbClose" aria-label="关闭">✕</button></div>' +
        '<div class="lb-stage" id="lbStage">' +
        '<img id="lbImg" alt="">' +
        '<button class="lb-arrow prev" id="lbPrev" aria-label="上一张">‹</button>' +
        '<button class="lb-arrow next" id="lbNext" aria-label="下一张">›</button></div>' +
        '<div class="lb-cap"><div class="c1"><span class="ct" id="lbTitle"></span><span class="cm" id="lbMeta"></span></div>' +
        '<div class="cd" id="lbDesc"></div></div>';
      document.body.appendChild(root);
      stage = $('#lbStage'); img = $('#lbImg'); count = $('#lbCount');
      title = $('#lbTitle'); meta = $('#lbMeta'); desc = $('#lbDesc');
      toast = document.createElement('div'); toast.className = 'lb-toast'; toast.id = 'lbToast';
      document.body.appendChild(toast);

      $('#lbClose').onclick = close;
      $('#lbPrev').onclick = function (e) { e.stopPropagation(); go(-1); };
      $('#lbNext').onclick = function (e) { e.stopPropagation(); go(1); };
      $('#lbOrig').onclick = function (e) { e.stopPropagation(); toggleOrig(); };
      $('#lbShare').onclick = function (e) { e.stopPropagation(); share(); };
      $('#lbDl').onclick = function (e) { e.stopPropagation(); download(); };
      stage.addEventListener('click', function (e) { if (e.target === img || e.target === stage) close(); });
      root.addEventListener('click', function (e) { if (e.target === root) close(); });

      img.addEventListener('dblclick', function () { scale > 1 ? resetZoom() : setZoom(2.2); });
      stage.addEventListener('wheel', function (e) {
        e.preventDefault();
        if (e.ctrlKey || Math.abs(e.deltaY) > 40) setZoom(scale * (e.deltaY < 0 ? 1.12 : 0.9));
      }, { passive: false });
      stage.addEventListener('pointerdown', onDown);
      stage.addEventListener('pointermove', onMove);
      stage.addEventListener('pointerup', onUp);
      stage.addEventListener('pointercancel', onUp);
    }

    function apply() {
      img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      stage.classList.toggle('zoomed', scale > 1);
    }
    function setZoom(s) { scale = Math.max(1, Math.min(5, s)); if (scale === 1) { tx = ty = 0; } apply(); }
    function resetZoom() { scale = 1; tx = ty = 0; apply(); }

    function onDown(e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pointers).length === 2) {
        var k = Object.keys(pointers);
        pinchStart = { d: dist(pointers[k[0]], pointers[k[1]]), s: scale };
        panning = false; return;
      }
      panStart = { x: e.clientX, y: e.clientY, tx: tx, ty: ty, t: Date.now() };
      if (scale > 1) { panning = true; stage.setPointerCapture(e.pointerId); }
    }
    function onMove(e) {
      if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinchStart && Object.keys(pointers).length === 2) {
        var k = Object.keys(pointers);
        var d = dist(pointers[k[0]], pointers[k[1]]);
        setZoom(pinchStart.s * (d / pinchStart.d)); e.preventDefault(); return;
      }
      if (panning && panStart) { tx = panStart.tx + (e.clientX - panStart.x); ty = panStart.ty + (e.clientY - panStart.y); apply(); }
    }
    function onUp(e) {
      var moved = panStart ? Math.hypot(e.clientX - panStart.x, e.clientY - panStart.y) : 0;
      var dt = panStart ? Date.now() - panStart.t : 0;
      delete pointers[e.pointerId];
      if (pinchStart && Object.keys(pointers).length < 2) pinchStart = null;
      panning = false;
      // 触摸左右滑动切图（未缩放）
      if (scale === 1 && moved > 60 && dt < 500) go(moved, e.clientX - panStart.x);
      panStart = null;
    }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    function open(list, index) {
      curList = list; idx = index; build();
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(function () { root.classList.add('show'); root.setAttribute('aria-hidden', 'false'); });
      render();
    }
    function render() {
      var it = curList[idx];
      showingOrig = false; resetZoom();
      img.src = it.preview || it.original;
      img.alt = it.title || '';
      count.textContent = (idx + 1) + ' / ' + curList.length;
      title.textContent = it.title || '';
      meta.textContent = [it.category, it.date, fmtRes(it)].filter(Boolean).join('  ·  ');
      desc.textContent = it.description || '';
      desc.style.display = it.description ? '' : 'none';
      var multi = curList.length > 1;
      $('#lbPrev').style.display = $('#lbNext').style.display = multi ? '' : 'none';
    }
    function go(delta) {
      if (!curList.length) return;
      idx = (idx + delta + curList.length) % curList.length;
      render();
      if (isPhotoPage) pushPhotoState(curList[idx]);
    }
    function toggleOrig() {
      var it = curList[idx];
      if (showingOrig) { img.src = it.preview || it.original; showingOrig = false; showToast('已切回预览'); }
      else { img.src = it.original || it.preview; showingOrig = true; showToast('原图 ' + fmtRes(it)); }
      resetZoom();
    }
    function share() {
      var it = curList[idx];
      var url = location.origin + '/gallery/' + it.id + '/';
      var payload = { title: (it.title || 'Photo') + ' · Gallery', text: it.title || '', url: url };
      if (navigator.share) { navigator.share(payload).catch(function () {}); return; }
      copy(url, '已复制图片链接');
    }
    function download() {
      var it = curList[idx];
      var a = document.createElement('a');
      a.href = it.original || it.preview; a.download = (it.id || 'photo');
      document.body.appendChild(a); a.click(); a.remove();
      showToast('开始下载原图');
    }
    function close() {
      root.classList.remove('show'); root.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      img.src = '';
    }
    function showToast(t) {
      toast.textContent = t; toast.classList.add('show');
      clearTimeout(showToast._t); showToast._t = setTimeout(function () { toast.classList.remove('show'); }, 1600);
    }
    function fmtRes(it) { return it.width ? (it.width + ' × ' + it.height) : ''; }
    function copy(text, msg) {
      var done = function () { showToast(msg); };
      if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); }); }
      else fallbackCopy(text, done);
    }
    function fallbackCopy(text, cb) {
      var ta = document.createElement('textarea'); ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); cb();
    }
    return { open: open, close: close, go: go };

    function pushPhotoState(it) {   // 独立页内切换：更新地址栏 + 页面信息
      var url = '/gallery/' + it.id + '/?view=1';
      history.replaceState(null, '', url);
      if (window.paintPhoto) window.paintPhoto(it);
      document.title = (it.title || 'Photo') + ' · Gallery · linsongりんそん';
    }
  })();

  document.addEventListener('keydown', function (e) {
    if (!$('#galleryLB') || !$('#galleryLB').classList.contains('show')) return;
    if (e.key === 'Escape') { LB.close(); }
    else if (e.key === 'ArrowRight') { LB.go(1); }
    else if (e.key === 'ArrowLeft') { LB.go(-1); }
  });

  /* ══════════════ 首页：瀑布流 ══════════════ */
  function initIndex() {
    var grid = $('#grid'), cats = $('#cats'), gcount = $('#gcount'), gsearch = $('#gsearch');
    var tag = new URLSearchParams(location.search).get('tag');

    function apply() {
      var list = DATA.filter(function (it) {
        if (state.cat !== '全部' && it.category !== state.cat) return false;
        if (state.tag && (it.tags || []).indexOf(state.tag) < 0 && it.id !== state.tag) return false;
        if (state.q) {
          var blob = [it.title, it.category, it.id, (it.tags || []).join(' '), it.description].join(' ').toLowerCase();
          if (blob.indexOf(state.q.toLowerCase()) < 0) return false;
        }
        return true;
      });
      VIEW = list;
      renderCats();
      renderGrid(list);
      gcount.textContent = list.length + ' 张' + (list.length !== DATA.length ? (' / ' + DATA.length) : '');
    }

    function renderCats() {
      var set = ['全部'];
      DATA.forEach(function (it) { if (it.category && set.indexOf(it.category) < 0) set.push(it.category); });
      cats.innerHTML = set.map(function (c) {
        return '<button class="cat' + (c === state.cat ? ' on' : '') + '" data-cat="' + c + '">' + c + '</button>';
      }).join('');
    }

    function renderGrid(list) {
      if (!list.length) { grid.innerHTML = '<div class="empty">没有匹配的图片</div>'; return; }
      grid.innerHTML = list.map(function (it, i) {
        var ar = it.width && it.height ? ('aspect-ratio:' + it.width + '/' + it.height) : 'aspect-ratio:4/3';
        var ovm = [it.category, it.date, it.width ? (it.width + '×' + it.height) : ''].filter(Boolean).join(' · ');
        return '<div class="card" data-i="' + i + '" role="button" tabindex="0" aria-label="' + (it.title || 'photo') + '">' +
          '<div class="ph" style="' + ar + '">' +
          '<img src="' + it.thumbnail + '" width="' + (it.width || '') + '" height="' + (it.height || '') +
          '" alt="' + (it.title || '') + '" loading="lazy" decoding="async">' +
          '<div class="ov"><div class="ovt">' + (it.title || '') + '</div><div class="ovm">' + ovm + '</div></div>' +
          '</div></div>';
      }).join('');
      $$('.card img', grid).forEach(function (im) {
        function on() { im.classList.add('loaded'); }
        if (im.complete) on(); else im.addEventListener('load', on);
      });
    }

    cats.addEventListener('click', function (e) {
      var b = e.target.closest('.cat'); if (!b) return;
      state.cat = b.dataset.cat; state.tag = ''; apply();
    });
    gsearch.addEventListener('input', function () { state.q = gsearch.value.trim(); apply(); });

    grid.addEventListener('click', function (e) {
      var c = e.target.closest('.card'); if (!c) return;
      LB.open(VIEW, +c.dataset.i);
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var c = e.target.closest('.card'); if (!c) return;
      e.preventDefault(); LB.open(VIEW, +c.dataset.i);
    });

    if (tag) { state.tag = tag; }
    apply();
  }

  /* ══════════════ 独立图页 ══════════════ */
  function initPhoto() {
    var id = document.body.dataset.photoId;
    var it = DATA.filter(function (x) { return x.id === id; })[0];
    var list = DATA;
    var start = it ? DATA.indexOf(it) : 0;
    var img = $('#photoImg'), stage = $('#photoStage');

    window.paintPhoto = function (x) {
      img.src = x.preview || x.original; img.alt = x.title || '';
      document.body.dataset.photoId = x.id;
      $('.p-title').textContent = x.title || '';
      $('.p-cat').textContent = x.category || '';
      $('.p-date').textContent = x.date || '';
      $('.p-res').textContent = fmtRes(x);
      $('.p-desc').textContent = x.description || '';
      $('.p-desc').style.display = x.description ? '' : 'none';
      var tg = $('.p-tags');
      tg.innerHTML = (x.tags || []).map(function (t) { return '<a class="tag" href="/gallery/?tag=' + t + '">#' + t + '</a>'; }).join('');
      var prevA = $('.p-nav .prev'), nextA = $('.p-nav .next');
      var pi = list.indexOf(x);
      prevA.href = '/gallery/' + list[(pi - 1 + list.length) % list.length].id + '/';
      nextA.href = '/gallery/' + list[(pi + 1) % list.length].id + '/';
    };

    var open = function () { LB.open(list, list.indexOf(DATA.filter(function (x) { return x.id === document.body.dataset.photoId; })[0])); };
    img.addEventListener('click', open);
    $('#openBtn').addEventListener('click', open);
    $('#zoomBtn').addEventListener('click', open);
    $('#origBtn').addEventListener('click', function () { /* 大图打开后由 LB 提供原图按钮 */ $('#photoImg').click(); });
    $('#shareBtn').addEventListener('click', function () {
      var url = location.href.split('?')[0];
      var payload = { title: document.title, url: url };
      if (navigator.share) navigator.share(payload).catch(function () {});
      else { var ta = document.createElement('textarea'); ta.value = url; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); toast('已复制链接'); }
    });
    $('#dlBtn').addEventListener('click', function () {
      var x = DATA.filter(function (z) { return z.id === document.body.dataset.photoId; })[0];
      var a = document.createElement('a'); a.href = x.original || x.preview; a.download = x.id;
      document.body.appendChild(a); a.click(); a.remove(); toast('开始下载原图');
    });

    if (new URLSearchParams(location.search).get('view') === '1') open();

    function toast(t) { var el = document.createElement('div'); el.className = 'lb-toast show'; el.textContent = t; el.style.bottom = '40px'; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1600); }
    function fmtRes(x) { return x.width ? (x.width + ' × ' + x.height) : ''; }
  }

  /* ══════════════ 启动 ══════════════ */
  function boot() {
    load().then(function () {
      if (isPhotoPage) initPhoto(); else initIndex();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
