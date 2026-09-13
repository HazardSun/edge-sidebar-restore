/*
 * Edge 侧边栏恢复 — 页面快捷入口（轻量内容脚本）
 *
 * 右侧常驻 4px 细条，鼠标悬停滑出 32px 窄栏（展开按钮 + 常用网站图标），
 * 点击后通过 chrome.sidePanel 打开原生侧边栏。
 * 与旧注入方案不同：不创建 iframe、不改变页面布局，仅 4px 悬停入口。
 */
(function () {
  'use strict';
  if (window.top !== window) return; // 仅顶层框架

  const ID = 'edge-sidebar-restore-entry';
  const STRIP_W = 4;
  const RAIL_W = 32;
  const STRIP_BG = 'rgba(0,120,212,0.28)';
  const FAVICON_CACHE_VERSION = 3;
  let faviconWriteQueue = Promise.resolve();
  let defaultFaviconSignaturePromise = null;

  const DEFAULT_LINKS = [
    { name:'YouTube', url:'https://youtube.com' },
    { name:'Gemini', url:'https://gemini.google.com' },
    { name:'Bing', url:'https://www.bing.com' },
    { name:'GitHub', url:'https://github.com' },
    { name:'ChatGPT', url:'https://chatgpt.com' },
    { name:'Wikipedia', url:'https://www.wikipedia.org' },
    { name:'Reddit', url:'https://reddit.com' },
    { name:'X', url:'https://x.com' },
  ];

  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    return darkMQ.matches
      ? { bg: '#1f1f1f', border: '#3d3d3d', icon: '#9fd0f7', hover: 'rgba(255,255,255,0.08)' }
      : { bg: '#f5f5f5', border: '#e0e0e0', icon: '#0078d4', hover: 'rgba(0,0,0,0.05)' };
  }

  function chevron(color) {
    return `<svg viewBox="0 0 24 24" width="18" height="18" style="display:block;pointer-events:none">
      <path d="M17.6 7.4 16.2 6l-6 6 6 6 1.4-1.4L13 12z" fill="${color}"/>
      <path d="M12.6 7.4 11.2 6l-6 6 6 6 1.4-1.4L8 12z" fill="${color}" opacity="0.45"/>
    </svg>`;
  }

  function browserFaviconUrl(pageUrl, size) {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', String(size || 32));
    return url.toString();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('读取图标失败'));
      reader.readAsDataURL(blob);
    });
  }

  async function blobSignature(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let hash = 2166136261;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    return `${bytes.length}:${hash >>> 0}`;
  }

  function getDefaultFaviconSignature() {
    if (!defaultFaviconSignaturePromise) {
      defaultFaviconSignaturePromise = (async () => {
        try {
          const response = await fetch(browserFaviconUrl('https://invalid-favicon.localhost/', 32), { cache: 'no-store' });
          return response.ok ? await blobSignature(await response.blob()) : null;
        } catch (e) {
          return null;
        }
      })();
    }
    return defaultFaviconSignaturePromise;
  }

  function cacheFaviconFromUrl(host, sourceUrl, options) {
    const force = Boolean(options && options.force);
    const rejectDefault = Boolean(options && options.rejectDefault);
    const task = faviconWriteQueue.then(async () => {
      try {
        const current = await chrome.storage.local.get(['faviconCache', 'faviconCacheVersion']);
        const cache = current.faviconCacheVersion === FAVICON_CACHE_VERSION
          ? (current.faviconCache || {})
          : {};
        if (!force && cache[host] && typeof cache[host].d === 'string') return cache[host].d;
        const response = await fetch(sourceUrl, { cache: 'no-store' });
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.size || blob.size > 256 * 1024 || (blob.type && !blob.type.startsWith('image/'))) return null;
        if (rejectDefault) {
          const [signature, defaultSignature] = await Promise.all([
            blobSignature(blob),
            getDefaultFaviconSignature()
          ]);
          if (defaultSignature && signature === defaultSignature) return null;
        }
        const data = await blobToDataUrl(blob);
        if (typeof data !== 'string' || !data.startsWith('data:image')) return null;
        cache[host] = { d: data, ts: Date.now(), permanent: true };
        await chrome.storage.local.set({
          faviconCache: cache,
          faviconCacheVersion: FAVICON_CACHE_VERSION
        });
        return data;
      } catch (e) {
        return null;
      }
    });
    faviconWriteQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  function cacheBrowserFavicon(host, pageUrl, options) {
    return cacheFaviconFromUrl(host, browserFaviconUrl(pageUrl, 32), {
      force: Boolean(options && options.force),
      rejectDefault: true
    });
  }

  function pageFaviconCandidates() {
    const result = [];
    const seen = new Set();
    const links = Array.from(document.querySelectorAll('link[rel][href]')).reverse();
    for (const link of links) {
      const rel = (link.getAttribute('rel') || '').toLowerCase();
      const relTokens = rel.split(/\s+/);
      if (!relTokens.includes('icon') && !rel.includes('apple-touch-icon')) continue;
      try {
        const url = new URL(link.href, location.href);
        if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol) || seen.has(url.href)) continue;
        seen.add(url.href);
        result.push(url.href);
      } catch (e) {}
    }
    return result;
  }

  let pageFaviconTimer = null;
  let forcePageFaviconRefresh = false;
  function scheduleCurrentPageFavicon(delay, force) {
    forcePageFaviconRefresh = forcePageFaviconRefresh || Boolean(force);
    clearTimeout(pageFaviconTimer);
    pageFaviconTimer = setTimeout(async () => {
      const refreshExisting = forcePageFaviconRefresh;
      forcePageFaviconRefresh = false;
      let pageUrl;
      try {
        pageUrl = new URL(location.href);
      } catch (e) {
        return;
      }
      if (pageUrl.protocol !== 'http:' && pageUrl.protocol !== 'https:') return;

      const candidates = pageFaviconCandidates();
      candidates.push(pageUrl.origin + '/favicon.ico');
      for (const sourceUrl of candidates) {
        const saved = await cacheFaviconFromUrl(pageUrl.hostname, sourceUrl, { force: refreshExisting });
        if (saved) return;
      }
      await cacheBrowserFavicon(pageUrl.hostname, pageUrl.href, { force: refreshExisting });
    }, delay || 0);
  }

  function openPanel(url) {
    try { chrome.runtime.sendMessage({ action: 'openSidePanel', url: url || null }); } catch (e) {}
  }

  function create() {
    if (document.getElementById(ID)) return;

    const host = document.createElement('div');
    host.id = ID;
    host.style.cssText = `
      position:fixed; top:0; right:0; height:100%; width:${STRIP_W}px;
      z-index:2147483646; background:${STRIP_BG};
      transition:width .18s ease, background .15s ease, box-shadow .15s ease;
      overflow:hidden; box-sizing:border-box;
    `;

    const railContent = document.createElement('div');
    railContent.style.cssText = `
      width:${RAIL_W}px; height:100%; display:flex; flex-direction:column;
      align-items:center; padding:8px 0; gap:4px; box-sizing:border-box;
      opacity:0; transition:opacity .12s ease;
    `;
    host.appendChild(railContent);

    // 展开按钮
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.title = '打开侧边栏';
    expandBtn.setAttribute('aria-label', '打开侧边栏');
    expandBtn.style.cssText = `
      width:26px; height:26px; flex-shrink:0; border:none; border-radius:6px;
      padding:0; cursor:pointer; background:transparent;
      display:flex; align-items:center; justify-content:center;
    `;
    expandBtn.addEventListener('mouseenter', () => { expandBtn.style.background = theme().hover; });
    expandBtn.addEventListener('mouseleave', () => { expandBtn.style.background = 'transparent'; });
    expandBtn.addEventListener('click', () => openPanel(null));
    railContent.appendChild(expandBtn);

    // 常用网站图标区
    const iconsBox = document.createElement('div');
    iconsBox.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:6px; margin-top:6px; width:100%;';
    railContent.appendChild(iconsBox);

    let expanded = false;
    let renderToken = 0;
    function renderIcons() {
      const token = ++renderToken;
      const th = theme();
      expandBtn.innerHTML = chevron(th.icon);
      chrome.storage.local.get(['quickLinks', 'faviconCache', 'faviconCacheVersion'], (res) => {
        if (token !== renderToken) return;
        const links = res.quickLinks || DEFAULT_LINKS;
        const fc = res.faviconCacheVersion === FAVICON_CACHE_VERSION ? (res.faviconCache || {}) : {};
        const max = Math.max(0, Math.min(links.length, Math.floor((window.innerHeight - 110) / 32)));
        iconsBox.innerHTML = '';
        links.slice(0, max).forEach((l) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.title = '在侧边栏打开 ' + l.name;
          const letter = (l.name[0] || '?').toUpperCase();
          b.textContent = letter;
          b.style.cssText = `
            width:24px; height:24px; flex-shrink:0; border:none; border-radius:6px;
            background:#fff; color:#0078d4; font-size:12px; font-weight:600;
            cursor:pointer; padding:0; line-height:24px; text-align:center;
            display:flex; align-items:center; justify-content:center;
          `;
          let u = null;
          try {
            const parsed = new URL(l.url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') u = parsed;
          } catch (e) {}
          if (u && u.hostname) {
            const img = document.createElement('img');
            img.alt = '';
            img.style.cssText = 'width:16px; height:16px; display:block; border-radius:3px;';
            img.addEventListener('load', () => { b.textContent = ''; b.appendChild(img); });
            const cached = fc[u.hostname];
            if (cached && typeof cached.d === 'string' && cached.d.startsWith('data:image')) {
              // 永久缓存命中：零网络直接使用。
              img.src = cached.d;
            } else {
              // 浏览器原生 favicon 能读取网站实际声明的图标；失败时再逐级降级。
              let stage = 0;
              img.addEventListener('load', () => {
                if (stage === 0) {
                  cacheBrowserFavicon(u.hostname, u.href).then((saved) => {
                    if (!saved && stage === 0 && img.isConnected) {
                      stage = 1;
                      img.src = u.origin + '/favicon.ico';
                    }
                  });
                } else if (stage === 1 || stage === 2) {
                  cacheFaviconFromUrl(u.hostname, img.src);
                }
              });
              img.addEventListener('error', () => {
                if (stage === 0) {
                  stage = 1;
                  img.src = u.origin + '/favicon.ico';
                } else if (stage === 1) {
                  stage = 2;
                  img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(u.hostname) + '&sz=32';
                }
              });
              img.src = browserFaviconUrl(u.href, 32);
            }
          }
          b.addEventListener('mouseenter', () => { b.style.background = '#e8f0fa'; });
          b.addEventListener('mouseleave', () => { b.style.background = '#fff'; });
          b.addEventListener('click', () => { if (u) openPanel(u.href); });
          iconsBox.appendChild(b);
        });
      });
    }

    host.addEventListener('mouseenter', () => {
      expanded = true;
      const th = theme();
      host.style.width = RAIL_W + 'px';
      host.style.background = th.bg;
      host.style.boxShadow = '-2px 0 8px rgba(0,0,0,0.12)';
      railContent.style.opacity = '1';
      renderIcons();
    });
    host.addEventListener('mouseleave', () => {
      expanded = false;
      host.style.width = STRIP_W + 'px';
      host.style.background = STRIP_BG;
      host.style.boxShadow = 'none';
      railContent.style.opacity = '0';
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && expanded &&
          (changes.quickLinks || changes.faviconCache || changes.faviconCacheVersion)) {
        renderIcons();
      }
    });
    window.addEventListener('resize', () => { if (expanded) renderIcons(); });
    darkMQ.addEventListener('change', () => {
      if (!expanded) return;
      const th = theme();
      host.style.background = th.bg;
      renderIcons();
    });

    document.documentElement.appendChild(host);
  }

  create();
  scheduleCurrentPageFavicon(200);
  window.addEventListener('load', () => scheduleCurrentPageFavicon(500));
  window.addEventListener('pageshow', () => scheduleCurrentPageFavicon(300));
  if (document.head) {
    const faviconObserver = new MutationObserver(() => scheduleCurrentPageFavicon(300, true));
    faviconObserver.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'rel']
    });
  }
})();
