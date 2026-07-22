// 原生侧边栏：点击工具栏图标（或快捷键 Ctrl+Shift+Y）打开/关闭
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('sidePanel 初始化失败:', e));
