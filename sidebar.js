(function() {
document.addEventListener('DOMContentLoaded', () => {
  TabSystem.init();
  Search.init();
  Calculator.init();
  Converter.init();
  ExchangeRate.init();
  QuickLinks.init();
  Notes.init();
  Clock.init();
  DailyNote.init();
  Browser.init();

  // 页面快捷入口带来的待打开网址（面板刚启动时兜底）
  chrome.storage.local.get(['pendingOpenUrl'], (res) => {
    if (res.pendingOpenUrl) {
      chrome.storage.local.remove('pendingOpenUrl');
      Browser.open(res.pendingOpenUrl);
    }
  });
});

// 页面快捷入口：面板已打开时直接在内置浏览器视图中打开网址
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === 'openUrl' && typeof msg.url === 'string') {
    chrome.storage.local.remove('pendingOpenUrl');
    Browser.open(msg.url);
  }
});

const TabSystem = {
  init() {
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        if (Browser.isOpen()) Browser.close();
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      });
    });
  }
};

const Search = {
  init() {
    const input = document.getElementById('search-input');
    const btn = document.getElementById('search-btn');
    const go = () => {
      const q = input.value.trim();
      if (!q) return;
      const engine = document.querySelector('input[name="engine"]:checked').value;
      const url = engine === 'google'
        ? `https://www.google.com/search?q=${encodeURIComponent(q)}`
        : `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
      Browser.open(url);
    };
    btn.addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    document.getElementById('sq-add-btn').addEventListener('click', () => {
      document.getElementById('sq-form').style.display = 'flex';
    });
    document.getElementById('sq-save-btn').addEventListener('click', () => this.save());
    document.getElementById('sq-cancel-btn').addEventListener('click', () => {
      document.getElementById('sq-name').value = '';
      document.getElementById('sq-url').value = '';
      document.getElementById('sq-form').style.display = 'none';
    });
    this.loadQuickLinks();
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.quickLinks) this.loadQuickLinks();
    });
  },
  loadQuickLinks() {
    const grid = document.getElementById('search-quick-links');
    chrome.storage.local.get(['quickLinks'], (res) => {
      this.links = res.quickLinks || DEFAULT_QUICK_LINKS;
      grid.innerHTML = this.links.map((l, i) => `
        <div class="link-item" data-url="${l.url}">
          <button class="del-btn" data-i="${i}">&times;</button>
          ${faviconHTML(l)}
          <span>${escHtml(l.name)}</span>
        </div>
      `).join('');
      bindFaviconFallback(grid);
      grid.querySelectorAll('.link-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.del-btn')) return;
          Browser.open(el.dataset.url);
        });
      });
      grid.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.links.splice(parseInt(btn.dataset.i), 1);
          this.store(); this.loadQuickLinks();
        });
      });
    });
  },
  store() { chrome.storage.local.set({ quickLinks: this.links }); },
  save() {
    const name = document.getElementById('sq-name').value.trim();
    let url = document.getElementById('sq-url').value.trim();
    if (!name || !url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    this.links.push({ name, url });
    this.store(); this.loadQuickLinks();
    document.getElementById('sq-name').value = '';
    document.getElementById('sq-url').value = '';
    document.getElementById('sq-form').style.display = 'none';
  }
};

function escHtml(s) { return String(s).replace(/[&<>"]/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }

// 网站 favicon：优先站点自身 /favicon.ico（内网站点浏览器可直连），
// 失败降级 Google favicon 服务，再失败回退首字母方块
function faviconHTML(l) {
  const letter = (l.name[0] || '?').toUpperCase();
  let host = '', origin = '';
  try {
    const u = new URL(l.url);
    host = u.hostname; origin = u.origin;
  } catch (e) { return `<div class="link-letter">${letter}</div>`; }
  if (!host) return `<div class="link-letter">${letter}</div>`;
  return `<img class="link-favicon" data-letter="${letter}" data-stage="0"
    data-host="${escHtml(host)}" data-origin="${escHtml(origin)}" alt="" loading="lazy"
    src="${escHtml(origin)}/favicon.ico">`;
}

// 渲染后调用：favicon 两级降级（站点 /favicon.ico → Google 服务 → 首字母）
function bindFaviconFallback(container) {
  container.querySelectorAll('.link-favicon').forEach(img => {
    img.addEventListener('error', () => {
      if (img.dataset.stage === '0') {
        img.dataset.stage = '1';
        img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(img.dataset.host) + '&sz=64';
      } else {
        const d = document.createElement('div');
        d.className = 'link-letter';
        d.textContent = img.dataset.letter || '?';
        img.replaceWith(d);
      }
    });
  });
}

// 从网址推导网站默认命名（去 www. 前缀）
function siteName(url) {
  try {
    const h = new URL(url).hostname;
    return h.replace(/^www\./, '') || url;
  } catch (e) { return url; }
}

// 首次安装时的默认快捷链接（搜索页 / 链接页 / 页面快捷入口共用）
// 筛选原则：剥离禁嵌头后可在侧边栏内嵌打开（Gmail/Drive 因登录态隔离不可用，已移除）
const DEFAULT_QUICK_LINKS = [
  { name:'YouTube', url:'https://youtube.com' },
  { name:'Gemini', url:'https://gemini.google.com' },
  { name:'Bing', url:'https://www.bing.com' },
  { name:'GitHub', url:'https://github.com' },
  { name:'ChatGPT', url:'https://chatgpt.com' },
  { name:'Wikipedia', url:'https://www.wikipedia.org' },
  { name:'Reddit', url:'https://reddit.com' },
  { name:'X', url:'https://x.com' },
];

const Calculator = {
  d: '0', op: null, op2: null, reset: false,
  init() {
    document.getElementById('calc-buttons').addEventListener('click', (e) => {
      const btn = e.target.closest('.c-btn');
      if (!btn) return;
      const v = btn.textContent.trim();
      if (btn.classList.contains('c-num')) this.digit(v);
      else if (btn.classList.contains('c-op')) this.oper(v);
      else if (btn.classList.contains('c-clear')) this.clear();
      else if (btn.classList.contains('c-eq')) this.eq();
    });
    document.addEventListener('keydown', (e) => {
      const k = e.key;
      if (/^[0-9.]$/.test(k)) this.digit(k);
      else if (['+','-','*','/'].includes(k)) {
        const m = {'+':'+','-':'-','*':'\xD7','/':'\xF7'};
        this.oper(m[k]);
      } else if (k === 'Enter' || k === '=') { e.preventDefault(); this.eq(); }
      else if (k === 'Escape') this.clear();
    });
  },
  disp() { document.getElementById('calc-display').textContent = this.d; },
  digit(v) {
    if (this.reset) { this.d = ''; this.reset = false; }
    if (v === '.' && this.d.includes('.')) return;
    this.d = this.d === '0' && v !== '.' ? v : this.d + v;
    this.disp();
  },
  oper(op) {
    if (op === '\u00B1') {
      if (this.d !== '0' && this.d !== 'Error') {
        this.d = this.d.startsWith('-') ? this.d.slice(1) : '-' + this.d;
        this.disp();
      }
      return;
    }
    if (this.op2) this.eq();
    const n = parseFloat(this.d);
    if (isNaN(n)) { this.clear(); return; }
    this.op = n;
    this.op2 = op;
    this.reset = true;
  },
  eq() {
    if (!this.op2) return;
    const a = this.op, b = parseFloat(this.d);
    let r;
    switch (this.op2) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '\xD7': r = a * b; break;
      case '\xF7': r = b !== 0 ? a / b : 'Error'; break;
      case '%': r = a % b; break;
    }
    this.d = r === 'Error' ? 'Error' : String(parseFloat(r.toFixed(10)));
    this.op2 = null; this.op = null; this.reset = true;
    this.disp();
  },
  clear() { this.d = '0'; this.op = null; this.op2 = null; this.reset = false; this.disp(); }
};

const Converter = {
  units: {
    length: { m:'米', km:'千米', cm:'厘米', mm:'毫米', ft:'英尺', in:'英寸' },
    weight: { kg:'千克', g:'克', lb:'磅', oz:'盎司', t:'吨' },
    temperature: { C:'摄氏度', F:'华氏度', K:'开尔文' },
    area: { m2:'平方米', km2:'平方千米', ha:'公顷', mu:'亩', sqft:'平方英尺' },
    volume: { L:'升', mL:'毫升', m3:'立方米', gal:'加仑', cup:'杯' },
    speed: { kmh:'km/h', ms:'m/s', mph:'mph', knot:'节' }
  },
  rates: {
    length: { m:1, km:1000, cm:0.01, mm:0.001, ft:0.3048, in:0.0254 },
    weight: { kg:1, g:0.001, lb:0.453592, oz:0.0283495, t:1000 },
    temperature: { C:'C', F:'F', K:'K' },
    area: { m2:1, km2:1000000, ha:10000, mu:666.667, sqft:0.092903 },
    volume: { L:1, mL:0.001, m3:1000, gal:3.78541, cup:0.236588 },
    speed: { kmh:1, ms:3.6, mph:1.60934, knot:1.852 }
  },
  init() {
    this.t = document.getElementById('conv-type');
    this.in = document.getElementById('conv-input');
    this.out = document.getElementById('conv-output');
    this.f = document.getElementById('conv-from');
    this.to = document.getElementById('conv-to');
    this.t.addEventListener('change', () => this.pop());
    this.in.addEventListener('input', () => this.cv());
    this.f.addEventListener('change', () => this.cv());
    this.to.addEventListener('change', () => this.cv());
    this.pop();
  },
  pop() {
    const type = this.t.value;
    const list = this.units[type];
    this.f.innerHTML = ''; this.to.innerHTML = '';
    const keys = Object.keys(list);
    keys.forEach((k, i) => {
      this.f.appendChild(new Option(list[k], k));
      this.to.appendChild(new Option(list[k], k));
    });
    if (keys.length > 1) this.to.value = keys[1];
    this.cv();
  },
  cv() {
    const type = this.t.value;
    const val = parseFloat(this.in.value);
    if (isNaN(val)) { this.out.value = ''; return; }
    const fr = this.f.value, t = this.to.value;
    const rate = this.rates[type];
    let r;
    if (type === 'temperature') {
      let c;
      if (fr === 'C') c = val;
      else if (fr === 'F') c = (val - 32) * 5/9;
      else c = val - 273.15;
      if (t === 'C') r = c;
      else if (t === 'F') r = c * 9/5 + 32;
      else r = c + 273.15;
    } else {
      const base = val * (rate[fr] || 1);
      r = base / (rate[t] || 1);
    }
    this.out.value = parseFloat(r.toFixed(6)).toString();
  }
};

const ExchangeRate = {
  currencies: { USD:'美元', EUR:'欧元', CNY:'人民币', JPY:'日元', GBP:'英镑', KRW:'韩元', HKD:'港币', TWD:'新台币', SGD:'新加坡元', AUD:'澳元', CAD:'加元', CHF:'瑞士法郎', THB:'泰铢', MXN:'墨西哥比索', INR:'印度卢比', BRL:'巴西雷亚尔', RUB:'卢布', NZD:'新西兰元', SEK:'瑞典克朗', NOK:'挪威克朗', DKK:'丹麦克朗', ZAR:'南非兰特', TRY:'土耳其里拉', PLN:'波兰兹罗提', PHP:'菲律宾比索', MYR:'马来西亚林吉特', IDR:'印尼盾', VND:'越南盾' },
  popular: ['USD','EUR','JPY','GBP','KRW','HKD','TWD','SGD','AUD','CAD','CHF','THB'],
  // 以 USD 为基准一次拉取全部汇率，本地计算交叉汇率：
  // 切换币种/互换/刷新列表均不再触发网络请求，消除感知延迟。
  SOURCES: [
    {
      url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      parse(d) {
        if (!d || !d.usd) return null;
        const r = {};
        for (const k in d.usd) r[k.toUpperCase()] = d.usd[k];
        return { rates: r, date: d.date || '' };
      }
    },
    {
      url: 'https://open.er-api.com/v6/latest/USD',
      parse(d) {
        if (!d || d.result !== 'success') return null;
        return { rates: d.rates, date: (d.time_last_update_utc || '').replace(' +0000', '') };
      }
    }
  ],
  CACHE_KEY: 'exRateCache',
  CACHE_TTL: 30 * 60 * 1000, // 缓存 30 分钟内不重复请求
  rates: null, dataDate: '', lastFetch: 0, fetching: false, timer: null,

  init() {
    this.from = document.getElementById('ex-from');
    this.to = document.getElementById('ex-to');
    this.amount = document.getElementById('ex-amount');
    this.result = document.getElementById('ex-result');
    this.rateDisplay = document.getElementById('ex-rate-display');
    this.popularRates = document.getElementById('ex-popular-rates');
    this.populateCurrencies();
    // 先用缓存秒开显示，再后台刷新
    this.loadCache();
    this.fetchRates();
    this.amount.addEventListener('input', () => this.convert());
    this.from.addEventListener('change', () => { this.convert(); this.showPopular(); });
    this.to.addEventListener('change', () => this.convert());
    document.getElementById('ex-refresh').addEventListener('click', () => this.fetchRates(true));
    document.getElementById('ex-swap').addEventListener('click', () => this.swap());
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.fetchRates(), this.CACHE_TTL);
  },

  populateCurrencies() {
    const keys = Object.keys(this.currencies);
    const opts = keys.map(k => `<option value="${k}">${this.currencies[k]} (${k})</option>`).join('');
    this.from.innerHTML = opts;
    this.to.innerHTML = opts;
    this.from.value = 'USD'; this.to.value = 'CNY';
  },

  loadCache() {
    chrome.storage.local.get([this.CACHE_KEY], (res) => {
      const c = res[this.CACHE_KEY];
      if (c && c.rates) {
        this.rates = c.rates;
        this.dataDate = c.date || '';
        this.lastFetch = c.ts || 0;
        this.convert();
        this.showPopular();
      }
    });
  },

  saveCache() {
    const c = { rates: this.rates, date: this.dataDate, ts: this.lastFetch };
    chrome.storage.local.set({ [this.CACHE_KEY]: c });
  },

  async fetchRates(force) {
    if (this.fetching) return;
    if (!force && this.rates && Date.now() - this.lastFetch < this.CACHE_TTL) return;
    this.fetching = true;
    if (!this.rates) this.rateDisplay.textContent = '加载中...';
    for (const src of this.SOURCES) {
      try {
        const resp = await fetch(src.url);
        const parsed = src.parse(await resp.json());
        if (parsed && parsed.rates && parsed.rates.CNY) {
          this.rates = parsed.rates;
          this.dataDate = parsed.date;
          this.lastFetch = Date.now();
          this.saveCache();
          this.convert();
          this.showPopular();
          this.fetching = false;
          return;
        }
      } catch (e) { /* 尝试下一个数据源 */ }
    }
    this.fetching = false;
    if (!this.rates) this.rateDisplay.textContent = '获取汇率失败，请稍后重试';
  },

  // 交叉汇率：以 USD 为桥，f→t = rates[t] / rates[f]
  crossRate(f, t) {
    if (!this.rates) return null;
    if (f === t) return 1;
    if (!this.rates[f] || !this.rates[t]) return null;
    return this.rates[t] / this.rates[f];
  },

  convert() {
    if (!this.rates) { this.result.value = ''; return; }
    const amount = parseFloat(this.amount.value);
    if (isNaN(amount) || amount < 0) { this.result.value = ''; this.rateDisplay.textContent = '—'; return; }
    const f = this.from.value, t = this.to.value;
    const rate = this.crossRate(f, t);
    if (rate == null) { this.result.value = 'N/A'; this.rateDisplay.textContent = '—'; return; }
    this.result.value = (amount * rate).toFixed(4);
    const parts = [`1 ${f} = ${this.fmtRate(rate)} ${t}`];
    if (this.dataDate) parts.push(`数据 ${this.dataDate}`);
    this.rateDisplay.textContent = parts.join(' · ');
    this.rateDisplay.title = this.lastFetch ? `本地更新：${new Date(this.lastFetch).toLocaleString('zh-CN')}` : '';
  },

  fmtRate(r) {
    // 小币种汇率过小/过大时保留更多有效位
    if (r >= 1) return Number(r.toFixed(4)).toString();
    return Number(r.toPrecision(4)).toString();
  },

  showPopular() {
    if (!this.rates) return;
    const base = this.from.value;
    this.popularRates.innerHTML = this.popular.filter(c => c !== base).map(c => {
      const rate = this.crossRate(base, c);
      if (rate == null) return '';
      return `<div class="ex-pop-item"><span>${this.currencies[c]||c} (${c})</span><span>${this.fmtRate(rate)}</span></div>`;
    }).join('');
  },

  swap() {
    const f = this.from.value, t = this.to.value;
    this.from.value = t;
    this.to.value = f;
    this.convert();
    this.showPopular();
  }
};

const QuickLinks = {
  init() {
    this.grid = document.getElementById('links-grid');
    this.form = document.getElementById('add-link-form');
    document.getElementById('add-link-btn').addEventListener('click', () => this.form.classList.remove('hidden'));
    document.getElementById('save-link-btn').addEventListener('click', () => this.save());
    document.getElementById('cancel-link-btn').addEventListener('click', () => { this.form.classList.add('hidden'); document.getElementById('link-name').value = ''; document.getElementById('link-url').value = ''; });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.quickLinks) this.load();
    });
    this.load();
  },
  load() {
    chrome.storage.local.get(['quickLinks'], (res) => {
      this.links = res.quickLinks || DEFAULT_QUICK_LINKS;
      this.render();
    });
  },
  render() {
    this.grid.innerHTML = this.links.map((l, i) => `
      <div class="link-item" data-url="${l.url}">
        <button class="del-btn" data-i="${i}">&times;</button>
        ${faviconHTML(l)}
        <span>${escHtml(l.name)}</span>
      </div>
    `).join('');
    bindFaviconFallback(this.grid);
    this.grid.querySelectorAll('.link-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.del-btn')) return;
        Browser.open(el.dataset.url);
      });
    });
    this.grid.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.links.splice(parseInt(btn.dataset.i), 1);
        this.store(); this.render();
      });
    });
  },
  store() { chrome.storage.local.set({ quickLinks: this.links }); },
  save() {
    const name = document.getElementById('link-name').value.trim();
    let url = document.getElementById('link-url').value.trim();
    if (!name || !url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    this.links.push({ name, url });
    this.store(); this.render();
    document.getElementById('link-name').value = ''; document.getElementById('link-url').value = '';
    this.form.classList.add('hidden');
  }
};

const Notes = {
  init() {
    this.el = document.getElementById('notes-textarea');
    this.st = document.getElementById('notes-status');
    chrome.storage.local.get(['notes'], (res) => { if (res.notes) this.el.value = res.notes; });
    let t;
    this.el.addEventListener('input', () => {
      this.st.textContent = '保存中...';
      clearTimeout(t);
      t = setTimeout(() => {
        chrome.storage.local.set({ notes: this.el.value }, () => {
          this.st.textContent = '已保存';
          setTimeout(() => { this.st.textContent = ''; }, 2000);
        });
      }, 500);
    });
  }
};

const Clock = {
  init() {
    this.t = document.getElementById('clock-time');
    this.d = document.getElementById('clock-date');
    this.g = document.getElementById('greeting-text');
    this.up(); setInterval(() => this.up(), 1000);
  },
  up() {
    const n = new Date();
    this.t.textContent = n.toLocaleTimeString('zh-CN', { hour12: false });
    const days = ['日','一','二','三','四','五','六'];
    this.d.textContent = `${n.getFullYear()}年${n.getMonth()+1}月${n.getDate()}日 周${days[n.getDay()]}`;
    const h = n.getHours();
    this.g.textContent = h < 6 ? '夜深了，早点休息' : h < 9 ? '早上好！' : h < 12 ? '上午好！' : h < 14 ? '中午好！' : h < 18 ? '下午好！' : '晚上好！';
  }
};

const DailyNote = {
  init() {
    this.el = document.getElementById('daily-note');
    chrome.storage.local.get(['dailyNote'], (res) => { if (res.dailyNote) this.el.value = res.dailyNote; });
    let t;
    this.el.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => chrome.storage.local.set({ dailyNote: this.el.value }), 500);
    });
  }
};

const Browser = {
  history: [],
  idx: -1,
  currentUrl: '',

  init() {
    this.view = document.getElementById('browser-view');
    this.iframe = document.getElementById('browser-iframe');
    this.urlEl = document.getElementById('br-url');
    this.backBtn = document.getElementById('br-back');
    this.fwdBtn = document.getElementById('br-fwd');
    this.refreshBtn = document.getElementById('br-refresh');
    this.closeBtn = document.getElementById('br-close');
    this.openTabBtn = document.getElementById('browser-open-tab');

    this.backBtn.addEventListener('click', () => this.goBack());
    this.fwdBtn.addEventListener('click', () => this.goForward());
    this.refreshBtn.addEventListener('click', () => this.refresh());
    this.closeBtn.addEventListener('click', () => this.close());
    this.openTabBtn.addEventListener('click', () => {
      if (this.currentUrl) chrome.tabs.create({ url: this.currentUrl });
    });

    this.iframe.addEventListener('load', () => {
      // 同源时可读取页面 <title>，升级顶栏显示（跨域时保持域名显示）
      try {
        const t = this.iframe.contentDocument && this.iframe.contentDocument.title;
        if (t && this.currentUrl) this.setTitle(t);
      } catch (e) {}
      this.updateNav();
    });
  },

  setTitle(text) { document.getElementById('app-title').textContent = text; },

  isOpen() { return !this.view.classList.contains('hidden'); },

  open(url) {
    if (url === this.currentUrl && this.isOpen()) return;
    document.getElementById('content').classList.add('hidden');
    this.view.classList.remove('hidden');
    this.currentUrl = url;
    this.urlEl.textContent = url;
    this.setTitle(siteName(url));
    this.iframe.src = url;
    this.history = this.history.slice(0, this.idx + 1);
    this.history.push(url);
    this.idx = this.history.length - 1;
    this.updateNav();
  },

  close() {
    if (!this.isOpen()) return;
    this.iframe.src = 'about:blank';
    this.view.classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
    this.currentUrl = '';
    this.setTitle('侧边栏工具');
  },

  goBack() {
    if (this.idx > 0) {
      this.idx--;
      this.iframe.src = this.history[this.idx];
      this.currentUrl = this.history[this.idx];
      this.urlEl.textContent = this.currentUrl;
      this.setTitle(siteName(this.currentUrl));
      this.updateNav();
    }
  },

  goForward() {
    if (this.idx < this.history.length - 1) {
      this.idx++;
      this.iframe.src = this.history[this.idx];
      this.currentUrl = this.history[this.idx];
      this.urlEl.textContent = this.currentUrl;
      this.setTitle(siteName(this.currentUrl));
      this.updateNav();
    }
  },

  refresh() {
    if (this.currentUrl) { this.iframe.src = this.currentUrl; }
  },

  updateNav() {
    this.backBtn.disabled = this.idx <= 0;
    this.fwdBtn.disabled = this.idx >= this.history.length - 1;
  }
};

})();
