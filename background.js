// 原生侧边栏：点击工具栏图标（或快捷键 Ctrl+Shift+Y）打开/关闭
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('sidePanel 初始化失败:', e));

// 页面快捷入口（content.js）：点击细条/网站图标时打开原生侧边栏。
// 用户手势经由消息传递，sidePanel.open 允许此方式。
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.action !== 'openSidePanel' || !sender.tab) return;

  if (msg.url) {
    // 面板未打开时由面板初始化读取；已打开时由下方广播直接处理
    chrome.storage.local.set({ pendingOpenUrl: msg.url });
  } else {
    chrome.storage.local.remove('pendingOpenUrl');
  }

  chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});

  if (msg.url) {
    // 面板若已打开，300ms 后直接收到；若刚启动，初始化时读 pendingOpenUrl 兜底
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'openUrl', url: msg.url }).catch(() => {});
    }, 300);
  }
});
