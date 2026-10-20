/* SPA 软导航：常驻外壳 + #view 内容替换，音频永不销毁 */
(function () {
  'use strict';

  var view = document.getElementById('view');
  if (!view) return;

  var currentKey = location.pathname + location.search;
  var cache = {}; // key(pathname+search) -> { type, nodes }
  var loadedCSS = new Set();
  document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
    var h = l.getAttribute('href'); if (h) loadedCSS.add(h);
  });

  function parseView(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var v = doc.getElementById('view');
    var type = '';
    var content = '';
    if (v) { type = v.dataset.page || ''; content = v.innerHTML; }
    else { type = doc.body.dataset.page || ''; content = doc.body.innerHTML; }

    var css = [];
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
      var h = l.getAttribute('href'); if (h && !loadedCSS.has(h)) { loadedCSS.add(h); css.push(h); }
    });

    return { type: type, content: content, title: doc.title, css: css };
  }

  function injectCSS(hrefs) {
    hrefs.forEach(function (h) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = h;
      document.head.appendChild(l);
    });
  }

  function runScripts(container) {
    var scripts = container.querySelectorAll('script');
    scripts.forEach(function (old) {
      var s = document.createElement('script');
      if (old.src) {
        var exists = document.querySelector('script[src="' + old.src + '"]');
        if (exists) { old.remove(); return; }
        s.src = old.src;
        s.defer = old.defer;
        s.async = old.async;
      } else {
        s.textContent = old.textContent;
      }
      old.replaceWith(s);
    });
  }

  function saveCurrent() {
    if (view.childNodes.length) {
      cache[currentKey] = { type: view.dataset.page || '', nodes: Array.from(view.childNodes) };
    }
  }

  function clearView() {
    while (view.firstChild) {
      view.removeChild(view.firstChild);
    }
  }

  function restoreView(nodes) {
    nodes.forEach(function (n) { view.appendChild(n); });
  }

  function setView(url, type, html, title, css) {
    if (css && css.length) injectCSS(css);

    window.dispatchEvent(new CustomEvent('spa:beforenav', {
      detail: { from: view.dataset.page, to: type, url: url }
    }));

    saveCurrent();
    clearView();

    var cached = cache[url];
    if (cached && cached.nodes) {
      restoreView(cached.nodes);
    } else {
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      while (tmp.firstChild) view.appendChild(tmp.firstChild);
      runScripts(view);
    }

    view.dataset.page = type || '';
    document.title = title || document.title;
    currentKey = url;
    if (view.childNodes.length) {
      cache[currentKey] = { type: view.dataset.page, nodes: Array.from(view.childNodes) };
    }

    // 返回主页且本标签页已进入过 → 跳过入口门（防御：脚本异常也不应卡在门上）
    if (view.dataset.page === 'home') {
      var entered = false;
      try { entered = sessionStorage.getItem('home-entered') === '1'; } catch (e) {}
      if (entered) {
        var g = document.getElementById('gate');
        if (g) { g.classList.add('gone'); g.style.display = 'none'; }
        document.body.classList.add('entered');
      }
    }

    window.dispatchEvent(new CustomEvent('spa:navigate', {
      detail: { page: type, url: url }
    }));
  }

  function navigate(href, push) {
    var url = new URL(href, location.href);
    // 同页锚点
    if (url.pathname === location.pathname && url.hash && !url.search) {
      var el = document.getElementById(url.hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: 'smooth' }); return; }
    }
    // 外部链接放行
    if (url.origin !== location.origin) { location.href = href; return; }

    if (push !== false) history.pushState({ spa: 1, href: href }, '', href);

    var k = url.pathname + url.search;
    var cached = cache[k];
    if (cached && cached.nodes) {
      setView(k, cached.type, '', '', []);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    fetch(href, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
      .then(function (text) {
        var p = parseView(text);
        setView(k, p.type, p.content, p.title, p.css);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function () { location.href = href; });
  }

  // 拦截点击
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#') || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (a.target === '_blank' || a.getAttribute('data-no-spa')) return;
    // 播放器 / Lightbox 内部不拦截
    if (a.closest('#plist') || a.closest('.playerbar') || a.closest('.lb')) return;
    e.preventDefault();
    navigate(href);
  });

  // 浏览器前进/后退
  window.addEventListener('popstate', function (e) {
    if (e.state && e.state.spa) navigate(e.state.href, false);
  });

  window.SPA = { navigate: function (href) { navigate(href); } };

  // 初始缓存当前页
  saveCurrent();
})();
