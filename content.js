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

    function renderIcons() {
      const th = theme();
      expandBtn.innerHTML = chevron(th.icon);
      chrome.storage.local.get(['quickLinks'], (res) => {
        const links = res.quickLinks || DEFAULT_LINKS;
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
          // 优先网站自身 /favicon.ico（内网站点可直连），失败降级 Google 服务，再失败保留首字母
          let u = null;
          try { u = new URL(l.url); } catch (e) {}
          if (u && u.hostname) {
            const img = document.createElement('img');
            img.alt = '';
            img.style.cssText = 'width:16px; height:16px; display:block; border-radius:3px;';
            let stage = 0;
            img.addEventListener('load', () => { b.textContent = ''; b.appendChild(img); });
            img.addEventListener('error', () => {
              if (stage === 0) {
                stage = 1;
                img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(u.hostname) + '&sz=32';
              }
              /* Google 服务也失败时保留首字母兜底 */
            });
            img.src = u.origin + '/favicon.ico';
          }
          b.addEventListener('mouseenter', () => { b.style.background = '#e8f0fa'; });
          b.addEventListener('mouseleave', () => { b.style.background = '#fff'; });
          b.addEventListener('click', () => openPanel(l.url));
          iconsBox.appendChild(b);
        });
      });
    }

    host.addEventListener('mouseenter', () => {
      const th = theme();
      host.style.width = RAIL_W + 'px';
      host.style.background = th.bg;
      host.style.boxShadow = '-2px 0 8px rgba(0,0,0,0.12)';
      railContent.style.opacity = '1';
      renderIcons();
    });
    host.addEventListener('mouseleave', () => {
      host.style.width = STRIP_W + 'px';
      host.style.background = STRIP_BG;
      host.style.boxShadow = 'none';
      railContent.style.opacity = '0';
    });

    document.documentElement.appendChild(host);
  }

  create();
})();
