// 原生侧边栏：点击工具栏图标（或快捷键 Ctrl+Shift+Y）打开/关闭
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('sidePanel 初始化失败:', e));

// 页面快捷入口（content.js）：点击细条/网站图标时打开原生侧边栏。
// 用户手势经由消息传递，sidePanel.open 允许此方式。
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.action !== 'openSidePanel' || !sender.tab) return;

  // sidePanel.open 必须在用户手势的同步调用链中启动；存储写入与打开并行，
  // 两者都完成后再广播。新面板也始终可从 pendingOpenUrl 读取兜底。
  const pendingWrite = msg.url
    ? chrome.storage.local.set({ pendingOpenUrl: msg.url })
    : chrome.storage.local.remove('pendingOpenUrl');
  const opening = chrome.sidePanel.open({ windowId: sender.tab.windowId });

  Promise.all([pendingWrite, opening]).then(() => {
    if (!msg.url) return;
    chrome.runtime.sendMessage({ action: 'openUrl', url: msg.url }).catch(() => {});
  }).catch((e) => console.error('处理侧边栏打开请求失败:', e));
});
