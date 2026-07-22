/*
 * Edge 侧边栏恢复 — 内容脚本
 *
 * 交互模型（对齐 Edge 原版侧边栏）：
 * - 收起状态：右侧常驻一条 32px 窄栏（rail），通过 body margin-right 占据
 *   布局空间而非悬浮遮挡页面内容；点击窄栏平滑展开。
 * - 展开状态：窄栏隐藏，完整侧边栏以宽度动画滑出，页面内容同步让位。
 * - 单一宿主容器：iframe 只创建一次并保持存活，折叠/展开只是宽度切换，
 *   侧边栏内部状态（笔记、标签页等）不会丢失。
 */
(function () {
  'use strict';

  const SIDEBAR_ID = 'edge-sidebar-restore';
  const RAIL_W = 32;          // 收起时窄栏宽度
  const DEFAULT_W = 360;      // 默认展开宽度
  const MIN_W = 200;
  const MAX_W = 600;
  const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const DURATION = 220;       // ms

  let host = null;            // 唯一宿主容器
  let rail = null;            // 收起态窄栏
  let railLinks = null;       // 窄栏中的常用网站图标区
  let expandBtn = null;       // 窄栏顶部展开按钮
  let handle = null;          // 拖拽调宽条
  let iframe = null;          // 侧边栏 iframe（懒加载，常驻）
  let iframeReady = false;    // iframe 是否加载完成
  let pendingUrl = null;      // 等待 iframe 就绪后要打开的网址
  let expanded = false;
  let expandedW = DEFAULT_W;
  let ready = false;          // 初始化完成（避免存储回调前的重复创建）

  // 与侧边栏 QuickLinks 默认列表保持一致
  const DEFAULT_LINKS = [
    { name:'Gmail', url:'https://mail.google.com' },
    { name:'YouTube', url:'https://youtube.com' },
    { name:'Google Drive', url:'https://drive.google.com' },
    { name:'GitHub', url:'https://github.com' },
    { name:'ChatGPT', url:'https://chat.openai.com' },
    { name:'Wikipedia', url:'https://en.wikipedia.org' },
    { name:'Reddit', url:'https://reddit.com' },
    { name:'X', url:'https://x.com' },
  ];

  /* ---------- 主题 ---------- */
  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    return darkMQ.matches
      ? { bg: '#1f1f1f', border: '#3d3d3d', icon: '#9fd0f7', iconHoverBg: 'rgba(255,255,255,0.06)' }
      : { bg: '#f5f5f5', border: '#e0e0e0', icon: '#0078d4', iconHoverBg: 'rgba(0,0,0,0.04)' };
  }

  /* ---------- 页面让位 ---------- */
  // 展开态：body margin-right 让出对应宽度（px 级精确，不影响字号）
  // 折叠态：html zoom 微缩 (~98%)——fixed 定位和 100vw 布局也会同步让位，
  //         是内容脚本无法调整视口大小时唯一不遮挡任何元素的方式
  function styleEl() {
    let s = document.getElementById(SIDEBAR_ID + '-s');
    if (!s) {
      s = document.createElement('style');
      s.id = SIDEBAR_ID + '-s';
      document.documentElement.appendChild(s);
    }
    return s;
  }

  function setMargin(w, animate) {
    const t = animate === false ? '' : `transition:margin-right ${DURATION}ms ${EASE} !important;`;
    styleEl().textContent = `
      html { zoom:1 !important; }
      body { margin-right:${w}px !important; ${t} }
      @media print { #${SIDEBAR_ID} { display:none !important; } body { margin-right:0 !important; } }
    `;
  }

  function setCollapsedZoom() {
    const z = (window.innerWidth - RAIL_W) / window.innerWidth;
    styleEl().textContent = `
      body { margin-right:0 !important; transition:none !important; }
      html { zoom:${z.toFixed(5)} !important; }
      @media print { #${SIDEBAR_ID} { display:none !important; } html { zoom:1 !important; } }
    `;
  }

  function clearMargin() {
    const s = document.getElementById(SIDEBAR_ID + '-s');
    if (s) s.remove();
  }

  /* ---------- 宿主容器 ---------- */
  function createHost() {
    if (host || document.getElementById(SIDEBAR_ID)) return;
    const th = theme();

    host = document.createElement('div');
    host.id = SIDEBAR_ID;
    host.style.cssText = `
      position:fixed !important; top:0 !important; right:0 !important;
      width:${RAIL_W}px; height:100% !important; height:100dvh !important;
      z-index:2147483646 !important; overflow:hidden !important;
      display:flex !important; flex-direction:row !important;
      background:${th.bg} !important;
      border-left:1px solid ${th.border} !important;
      box-sizing:border-box !important;
      transition:width ${DURATION}ms ${EASE};
    `;

    // 收起态窄栏（rail）：不遮挡页面（页面已让位），内含展开按钮 + 常用网站图标
    rail = document.createElement('div');
    rail.style.cssText = `
      width:${RAIL_W}px; height:100%; flex-shrink:0;
      background:${th.bg}; display:flex; flex-direction:column;
      align-items:center; padding:8px 0; gap:4px; overflow:hidden;
      box-sizing:border-box;
    `;

    expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.title = '展开侧边栏';
    expandBtn.setAttribute('aria-label', '展开侧边栏');
    expandBtn.style.cssText = `
      width:26px; height:26px; flex-shrink:0; border:none; border-radius:6px;
      padding:0; cursor:pointer; background:transparent;
      display:flex; align-items:center; justify-content:center;
    `;
    expandBtn.innerHTML = railIcon(th.icon);
    expandBtn.addEventListener('mouseenter', () => { expandBtn.style.background = th.iconHoverBg; });
    expandBtn.addEventListener('mouseleave', () => { expandBtn.style.background = 'transparent'; });
    expandBtn.addEventListener('click', () => expand());
    rail.appendChild(expandBtn);

    railLinks = document.createElement('div');
    railLinks.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:6px; margin-top:6px; width:100%;';
    rail.appendChild(railLinks);
    host.appendChild(rail);
    renderRailLinks();

    // 拖拽调宽条（展开态）
    handle = document.createElement('div');
    handle.title = '拖拽调整宽度';
    handle.style.cssText = `
      width:6px; height:100%; flex-shrink:0; display:none;
      cursor:col-resize; background:transparent;
    `;
    handle.addEventListener('mouseenter', () => { handle.style.background = 'rgba(0,120,212,0.25)'; });
    handle.addEventListener('mouseleave', () => { handle.style.background = 'transparent'; });
    initDrag();
    host.appendChild(handle);

    document.documentElement.appendChild(host);
    setCollapsedZoom();
    darkMQ.addEventListener('change', applyTheme);
    window.addEventListener('resize', onResize);
    chrome.storage.onChanged.addListener(onStorageChange);
  }

  function onResize() {
    renderRailLinks();
    if (host && !expanded) setCollapsedZoom();
  }

  function onStorageChange(changes, area) {
    if (area === 'local' && changes.quickLinks) renderRailLinks();
  }

  function railIcon(color) {
    // 双尖括号向左，与 Edge 展开图标风格一致
    return `<svg viewBox="0 0 24 24" width="18" height="18" style="display:block;pointer-events:none">
      <path d="M17.6 7.4 16.2 6l-6 6 6 6 1.4-1.4L13 12z" fill="${color}"/>
      <path d="M12.6 7.4 11.2 6l-6 6 6 6 1.4-1.4L8 12z" fill="${color}" opacity="0.45"/>
    </svg>`;
  }

  function applyTheme() {
    if (!host) return;
    const th = theme();
    host.style.background = th.bg;
    host.style.borderLeftColor = th.border;
    rail.style.background = th.bg;
    expandBtn.innerHTML = railIcon(th.icon);
    if (iframe) iframe.style.background = th.bg;
  }

  /* ---------- 窄栏常用网站图标 ---------- */
  function renderRailLinks() {
    if (!railLinks) return;
    chrome.storage.local.get(['quickLinks'], (res) => {
      if (!railLinks) return;
      const links = res.quickLinks || DEFAULT_LINKS;
      // 按视口高度限制图标数量，避免溢出
      const max = Math.max(0, Math.min(links.length, Math.floor((window.innerHeight - 110) / 32)));
      railLinks.innerHTML = '';
      links.slice(0, max).forEach((l) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = l.name;
        b.setAttribute('aria-label', '在侧边栏打开 ' + l.name);
        b.textContent = (l.name[0] || '?').toUpperCase();
        b.style.cssText = `
          width:24px; height:24px; flex-shrink:0; border:none; border-radius:6px;
          background:#0078d4; color:#fff; font-size:12px; font-weight:600;
          cursor:pointer; padding:0; line-height:24px; text-align:center;
        `;
        b.addEventListener('mouseenter', () => { b.style.background = '#106ebe'; });
        b.addEventListener('mouseleave', () => { b.style.background = '#0078d4'; });
        b.addEventListener('click', () => openInSidebar(l.url));
        railLinks.appendChild(b);
      });
    });
  }

  // 点击窄栏图标：展开侧边栏并在内置浏览器视图中打开该网址
  function openInSidebar(url) {
    pendingUrl = url;
    expand();
    flushPending();
  }

  function flushPending() {
    if (pendingUrl && iframeReady && iframe) {
      try { iframe.contentWindow.postMessage({ action: 'openUrl', url: pendingUrl }, '*'); } catch (e) {}
      pendingUrl = null;
    }
  }

  function ensureIframe() {
    if (iframe) return;
    iframeReady = false;
    iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidebar.html');
    iframe.setAttribute('aria-label', '侧边栏');
    iframe.style.cssText = `flex:1; height:100%; border:none; display:none; background:${theme().bg};`;
    iframe.addEventListener('load', () => { iframeReady = true; flushPending(); });
    host.appendChild(iframe);
  }

  /* ---------- 展开 / 收起 ---------- */
  function expand(animate = true) {
    if (!host) createHost();
    if (!host || expanded) return;
    expanded = true;
    ensureIframe();

    if (!animate) setTransition(false);
    rail.style.display = 'none';
    handle.style.display = 'block';
    iframe.style.display = 'block';
    host.style.width = expandedW + 'px';
    host.style.boxShadow = '-4px 0 12px rgba(0,0,0,0.06)';
    setMargin(expandedW, animate);
    if (!animate) requestAnimationFrame(() => setTransition(true));

    chrome.storage.local.set({ sidebarExpanded: true });
    flushPending();
  }

  function collapse(animate = true) {
    if (!host || !expanded) return;
    expanded = false;

    if (!animate) setTransition(false);
    host.style.width = RAIL_W + 'px';
    host.style.boxShadow = 'none';
    // 动画期间用 margin 平滑收拢，结束后切换为 zoom 模式确保零遮挡
    if (animate) {
      setMargin(RAIL_W, true);
      setTimeout(() => { if (!expanded) setCollapsedZoom(); }, DURATION);
    } else {
      setCollapsedZoom();
    }

    const done = () => {
      if (expanded || !host) return;
      rail.style.display = 'flex';
      handle.style.display = 'none';
      if (iframe) iframe.style.display = 'none';
    };
    if (animate) setTimeout(done, DURATION);
    else { done(); requestAnimationFrame(() => setTransition(true)); }

    chrome.storage.local.set({ sidebarExpanded: false });
  }

  function setTransition(on) {
    if (host) host.style.transition = on ? `width ${DURATION}ms ${EASE}` : 'none';
  }

  function toggle() {
    if (!host) { expand(); return; }
    expanded ? collapse() : expand();
  }

  function destroy() {
    if (host) { host.remove(); host = null; rail = railLinks = expandBtn = handle = iframe = null; }
    expanded = false;
    iframeReady = false;
    pendingUrl = null;
    clearMargin();
    darkMQ.removeEventListener('change', applyTheme);
    window.removeEventListener('resize', onResize);
    chrome.storage.onChanged.removeListener(onStorageChange);
  }

  /* ---------- 拖拽调宽 ---------- */
  function initDrag() {
    handle.addEventListener('mousedown', (e) => {
      if (!expanded) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = host.offsetWidth;
      setTransition(false);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      if (iframe) iframe.style.pointerEvents = 'none';

      function onMove(ev) {
        let w = startW - (ev.clientX - startX);
        w = Math.max(MIN_W, Math.min(MAX_W, w));
        expandedW = w;
        host.style.width = w + 'px';
        setMargin(w, false);
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (iframe) iframe.style.pointerEvents = '';
        setTransition(true);
        chrome.storage.local.set({ sidebarWidth: expandedW });
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ---------- 消息 ---------- */
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg && msg.action) {
      case 'toggleSidebar': toggle(); break;
      case 'showSidebar':
        if (!host) init();
        break;
      case 'collapseSidebar':
        if (expanded) collapse();
        break;
      case 'hideSidebar':
        destroy();
        break;
    }
  });

  // iframe 内部通过 window.postMessage 请求折叠
  window.addEventListener('message', (e) => {
    if (e.data && e.data.action === 'collapseSidebar' && expanded) collapse();
  });

  /* ---------- 初始化：恢复上次状态 ---------- */
  function init() {
    if (ready) return;
    ready = true;
    chrome.storage.local.get(['sidebarVisible', 'sidebarExpanded', 'sidebarWidth'], (res) => {
      if (res.sidebarWidth >= MIN_W && res.sidebarWidth <= MAX_W) expandedW = res.sidebarWidth;
      if (res.sidebarVisible === false) return;
      createHost();
      if (res.sidebarExpanded) expand(false);
    });
  }

  init();
})();
