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
  let handle = null;          // 拖拽调宽条
  let iframe = null;          // 侧边栏 iframe（懒加载，常驻）
  let expanded = false;
  let expandedW = DEFAULT_W;
  let ready = false;          // 初始化完成（避免存储回调前的重复创建）

  /* ---------- 主题 ---------- */
  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    return darkMQ.matches
      ? { bg: '#1f1f1f', border: '#3d3d3d', icon: '#9fd0f7', iconHoverBg: 'rgba(255,255,255,0.06)' }
      : { bg: '#f5f5f5', border: '#e0e0e0', icon: '#0078d4', iconHoverBg: 'rgba(0,0,0,0.04)' };
  }

  /* ---------- 页面让位（margin） ---------- */
  function setMargin(w, animate) {
    let s = document.getElementById(SIDEBAR_ID + '-s');
    if (!s) {
      s = document.createElement('style');
      s.id = SIDEBAR_ID + '-s';
      document.documentElement.appendChild(s);
    }
    const t = animate === false ? '' : `transition:margin-right ${DURATION}ms ${EASE} !important;`;
    s.textContent = `
      body { margin-right:${w}px !important; ${t} }
      @media print { #${SIDEBAR_ID} { display:none !important; } body { margin-right:0 !important; } }
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

    // 收起态窄栏（rail）：整条可点击，不遮挡页面（页面已让位）
    rail = document.createElement('button');
    rail.type = 'button';
    rail.title = '展开侧边栏';
    rail.setAttribute('aria-label', '展开侧边栏');
    rail.style.cssText = `
      width:${RAIL_W}px; height:100%; flex-shrink:0;
      border:none; padding:0; cursor:pointer;
      background:${th.bg}; display:flex; align-items:center; justify-content:center;
    `;
    rail.innerHTML = railIcon(th.icon);
    rail.addEventListener('mouseenter', () => { rail.style.background = th.iconHoverBg; });
    rail.addEventListener('mouseleave', () => { rail.style.background = theme().bg; });
    rail.addEventListener('click', () => expand());
    host.appendChild(rail);

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
    setMargin(RAIL_W, false);
    darkMQ.addEventListener('change', applyTheme);
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
    rail.innerHTML = railIcon(th.icon);
    if (iframe) iframe.style.background = th.bg;
  }

  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidebar.html');
    iframe.setAttribute('aria-label', '侧边栏');
    iframe.style.cssText = `flex:1; height:100%; border:none; display:none; background:${theme().bg};`;
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
  }

  function collapse(animate = true) {
    if (!host || !expanded) return;
    expanded = false;

    if (!animate) setTransition(false);
    host.style.width = RAIL_W + 'px';
    host.style.boxShadow = 'none';
    setMargin(RAIL_W, animate);

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
    if (host) { host.remove(); host = null; rail = handle = iframe = null; }
    expanded = false;
    clearMargin();
    darkMQ.removeEventListener('change', applyTheme);
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
