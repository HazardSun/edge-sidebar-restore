chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ sidebarVisible: true, sidebarExpanded: false });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || tab.id < 0) return;
  const isChromePage = tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('about:');
  if (isChromePage) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
  } catch {
    const { sidebarVisible } = await chrome.storage.local.get('sidebarVisible');
    if (sidebarVisible) {
      try { await chrome.tabs.sendMessage(tab.id, { action: 'showSidebar' }); } catch {}
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
    chrome.storage.local.get('sidebarVisible', (res) => {
      if (res.sidebarVisible) {
        chrome.tabs.sendMessage(tabId, { action: 'showSidebar' }).catch(() => {});
      }
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'collapseSidebar' && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, { action: 'collapseSidebar' }).catch(() => {});
  }
});
