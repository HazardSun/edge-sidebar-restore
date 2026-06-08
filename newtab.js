let ntLinks = [];

function ntCollapse() {
  ntExpanded = false;
  wrap.classList.add('collapsed');
  pill.style.display = 'flex';
  chrome.storage.local.set({ ntSidebarExpanded: false });
}
function ntExpand() {
  ntExpanded = true;
  wrap.classList.remove('collapsed');
  pill.style.display = 'none';
  chrome.storage.local.set({ ntSidebarExpanded: true });
}

const wrap = document.getElementById('sidebar-wrap');
const pill = document.getElementById('nt-pill');
let ntExpanded = true;

pill.addEventListener('click', ntExpand);

let lastNtCmd = 0;
setInterval(() => {
  chrome.storage.local.get('ntCmd', (res) => {
    if (res.ntCmd && res.ntCmd !== lastNtCmd) {
      lastNtCmd = res.ntCmd;
      if (ntExpanded) ntCollapse();
    }
  });
}, 150);

chrome.storage.local.get('ntSidebarExpanded', (res) => {
  if (res.ntSidebarExpanded === false) ntCollapse();
  else ntExpand();
});

function esc(s) { return String(s).replace(/[&<>"]/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }

function renderLinks() {
  const grid = document.getElementById('nt-links');
  grid.innerHTML = ntLinks.map((l, i) => `
    <div class="link-card" data-url="${esc(l.url)}">
      <button class="del-link" data-i="${i}">&times;</button>
      <div class="link-letter">${(l.name[0]||'?').toUpperCase()}</div>
      <span class="ln">${esc(l.name)}</span>
    </div>
  `).join('') + `
    <div class="add-link-card" id="nt-add-link">
      <div>+</div>
      <span>添加</span>
    </div>
  `;
  grid.querySelectorAll('.link-card:not(.add-link-card)').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.del-link')) return;
      window.open(el.dataset.url, '_blank');
    });
  });
  grid.querySelectorAll('.del-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ntLinks.splice(parseInt(btn.dataset.i), 1);
      chrome.storage.local.set({ quickLinks: ntLinks });
      renderLinks();
    });
  });
  document.getElementById('nt-add-link').addEventListener('click', () => {
    document.getElementById('nt-edit-form').style.display = 'flex';
  });
}

function loadLinks() {
  chrome.storage.local.get(['quickLinks'], (res) => {
    ntLinks = res.quickLinks || [
      { name:'Gmail', url:'https://mail.google.com' },
      { name:'YouTube', url:'https://youtube.com' },
      { name:'Google Drive', url:'https://drive.google.com' },
      { name:'GitHub', url:'https://github.com' },
      { name:'ChatGPT', url:'https://chat.openai.com' },
      { name:'Wikipedia', url:'https://en.wikipedia.org' },
      { name:'Reddit', url:'https://reddit.com' },
      { name:'X', url:'https://x.com' },
    ];
    renderLinks();
  });
}
loadLinks();

document.getElementById('nt-save-link').addEventListener('click', () => {
  const name = document.getElementById('nt-link-name').value.trim();
  let url = document.getElementById('nt-link-url').value.trim();
  if (!name || !url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  ntLinks.push({ name, url });
  chrome.storage.local.set({ quickLinks: ntLinks });
  renderLinks();
  document.getElementById('nt-link-name').value = '';
  document.getElementById('nt-link-url').value = '';
  document.getElementById('nt-edit-form').style.display = 'none';
});
document.getElementById('nt-cancel-link').addEventListener('click', () => {
  document.getElementById('nt-link-name').value = '';
  document.getElementById('nt-link-url').value = '';
  document.getElementById('nt-edit-form').style.display = 'none';
});

function go() {
  const q = document.getElementById('nt-search').value.trim();
  if (!q) return;
  window.location.href = 'https://www.bing.com/search?q=' + encodeURIComponent(q);
}
document.getElementById('nt-search-btn').addEventListener('click', go);
document.getElementById('nt-search').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
