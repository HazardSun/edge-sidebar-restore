const EXPANDED_W = 360;
const SIDEBAR_ID = 'edge-sidebar-restore';
const THEME_BG = '#f5f5f5';
const THEME_BORDER = '#e0e0e0';

let sidebar = null;
let pill = null;
let expanded = false;
let busy = false;

function createPill() {
  if (pill) return;
  pill = document.createElement('div');
  pill.id = SIDEBAR_ID + '-pill';
  pill.setAttribute('aria-label', '展开侧边栏');
  pill.setAttribute('title', '展开侧边栏');
  pill.style.cssText = `
    position:fixed !important;
    right:0 !important;
    top:50% !important;
    transform:translateY(-50%) !important;
    z-index:2147483646 !important;
    width:44px !important;
    height:44px !important;
    border-radius:8px 0 0 8px !important;
    background:${THEME_BG} !important;
    border:1px solid ${THEME_BORDER} !important;
    border-right:none !important;
    box-shadow:-2px 0 8px rgba(0,0,0,0.08) !important;
    cursor:pointer !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important;
    transition:width 0.2s, background 0.15s !important;
    user-select:none !important;
  `;
  pill.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" style="display:block;flex-shrink:0"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="#0078d4"/></svg>`;
  pill.addEventListener('mouseenter', () => {
    pill.style.width = '100px';
    if (!pill.querySelector('span')) {
      const span = document.createElement('span');
      span.textContent = '展开';
      span.style.cssText = 'font-size:13px;color:#0078d4;font-weight:500;white-space:nowrap;overflow:hidden;margin-left:2px';
      pill.appendChild(span);
    }
  });
  pill.addEventListener('mouseleave', () => {
    pill.style.width = '44px';
    const span = pill.querySelector('span');
    if (span) span.remove();
  });
  pill.addEventListener('click', () => expand());
  document.documentElement.appendChild(pill);
}

function removePill() {
  if (pill) { pill.remove(); pill = null; }
}

function expand() {
  if (busy) return;
  busy = true;
  removePill();
  createSidebar();
  expanded = true;
  chrome.storage.local.set({ sidebarVisible: true, sidebarExpanded: true });
  busy = false;
}

function collapse() {
  if (busy) return;
  busy = true;
  if (sidebar) { sidebar.remove(); sidebar = null; }
  expanded = false;
  const s = document.getElementById(SIDEBAR_ID + '-s');
  if (s) { s.remove(); }
  createPill();
  chrome.storage.local.set({ sidebarExpanded: false });
  busy = false;
}

function setMargin(w) {
  let s = document.getElementById(SIDEBAR_ID + '-s');
  if (!s) {
    s = document.createElement('style');
    s.id = SIDEBAR_ID + '-s';
    document.documentElement.appendChild(s);
  }
  s.textContent = w ? `body { margin-right:${w}px !important; transition:margin-right 0.22s cubic-bezier(0.4,0,0.2,1) !important; }` : '';
}

function createSidebar() {
  if (sidebar) return;
  if (document.getElementById(SIDEBAR_ID)) return;

  sidebar = document.createElement('div');
  sidebar.id = SIDEBAR_ID;
  sidebar.style.cssText = `
    position:fixed !important; top:0 !important; right:0 !important;
    width:${EXPANDED_W}px !important;
    height:100% !important; height:100dvh !important;
    z-index:2147483646 !important; overflow:hidden !important;
    display:flex !important; flex-direction:row !important;
    background:${THEME_BG} !important;
    border-left:1px solid ${THEME_BORDER} !important;
    box-shadow:-4px 0 12px rgba(0,0,0,0.06) !important;
    box-sizing:border-box !important;
  `;

  const handle = document.createElement('div');
  handle.title = '拖拽调整宽度 | 点击折叠';
  handle.style.cssText = `
    width:8px !important; height:100% !important; flex-shrink:0 !important;
    cursor:col-resize !important; background:transparent !important;
    position:relative !important; z-index:1 !important;
  `;
  sidebar.appendChild(handle);

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('sidebar.html');
  iframe.style.cssText = 'flex:1 !important; height:100% !important; border:none !important; background:' + THEME_BG + ' !important;';
  iframe.setAttribute('aria-label', '侧边栏');
  sidebar.appendChild(iframe);

  document.documentElement.appendChild(sidebar);

  setMargin(EXPANDED_W);

  let dragging = false;
  let didDrag = false;
  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    didDrag = false;
    const startX = e.clientX;
    const startW = EXPANDED_W;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev) {
      if (!dragging) return;
      didDrag = true;
      let w = startW - (ev.clientX - startX);
      if (w < 160) w = 160;
      if (w > 600) w = 600;
      sidebar.style.width = w + 'px';
      sidebar.style.setProperty('width', w + 'px', 'important');
      setMargin(w);
    }
    function onUp() {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!didDrag) collapse();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  const ifr = iframe;
  if (ifr && ifr.contentWindow) {
    const notify = () => { try { ifr.contentWindow.postMessage({ action: 'expand' }, '*'); } catch(e) {} };
    if (ifr.contentDocument && ifr.contentDocument.readyState === 'complete') notify();
    else { ifr.addEventListener('load', notify, { once: true }); setTimeout(notify, 2000); }
  }
}

window.addEventListener('message', (e) => {
  if (e.data && e.data.action === 'collapseSidebar') {
    if (expanded) collapse();
  }
});

function toggle() {
  if (expanded) { collapse(); }
  else { expand(); }
}

function ensureVisible() {
  if (!expanded && !pill) {
    chrome.storage.local.get('sidebarExpanded', (r) => {
      if (r.sidebarExpanded) expand();
      else createPill();
    });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'toggleSidebar') {
    toggle();
  }
  else if (msg.action === 'showSidebar') {
    ensureVisible();
  }
  else if (msg.action === 'collapseSidebar') {
    if (expanded) collapse();
  }
  else if (msg.action === 'hideSidebar') {
    removePill();
    if (sidebar) { sidebar.remove(); sidebar = null; }
    expanded = false;
    const s = document.getElementById(SIDEBAR_ID + '-s');
    if (s) { s.remove(); }
  }
});

chrome.storage.local.get(['sidebarVisible', 'sidebarExpanded'], (res) => {
  if (res.sidebarVisible !== false) {
    if (res.sidebarExpanded) expand();
    else createPill();
  }
});
