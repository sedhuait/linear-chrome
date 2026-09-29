chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const existing = await chrome.storage.local.get(["linear_settings"]);
    if (!existing.linear_settings) {
      await chrome.storage.local.set({
        linear_settings: {
          includeScreenshotByDefault: true,
          includeEnvInfo: true,
          defaultTicketType: "Bug",
          autoCaptureOnOpen: true,
          rememberLastSelectedPerDomain: true
        }
      });
    }
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(
      message.windowId || chrome.windows.WINDOW_ID_CURRENT,
      { format: "png" },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, dataUrl });
        }
      }
    );
    return true;
  }
  if (message.type === "EXTRACT_PAGE_METADATA") {
    extractActiveTabMetadata(message.tabId).then((metadata) => sendResponse({ success: true, metadata })).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
async function extractActiveTabMetadata(tabId) {
  let targetTab;
  if (tabId) {
    try {
      targetTab = await chrome.tabs.get(tabId);
    } catch {
    }
  }
  if (!targetTab) {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    targetTab = tabs[0];
  }
  if (!targetTab || !targetTab.url) {
    throw new Error("No active browser tab found");
  }
  const tabUrl = targetTab.url;
  const tabTitle = targetTab.title || "";
  let urlObj = null;
  try {
    urlObj = new URL(tabUrl);
  } catch {
  }
  const fallbackMetadata = {
    url: tabUrl,
    origin: urlObj?.origin || "",
    hostname: urlObj?.hostname || "",
    pathname: urlObj?.pathname || "",
    title: tabTitle || urlObj?.hostname || "Untitled Page",
    metaTags: {},
    viewport: {
      width: targetTab.width || 0,
      height: targetTab.height || 0
    },
    userAgent: navigator.userAgent
  };
  if (targetTab.id && !tabUrl.startsWith("chrome://") && !tabUrl.startsWith("chrome-extension://")) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          const metaTags = {};
          const metas = document.querySelectorAll("meta");
          metas.forEach((m) => {
            const key = m.getAttribute("name") || m.getAttribute("property") || m.getAttribute("itemprop");
            const content = m.getAttribute("content");
            if (key && content) {
              metaTags[key.trim()] = content.trim();
            }
          });
          return {
            url: window.location.href,
            origin: window.location.origin,
            hostname: window.location.hostname,
            pathname: window.location.pathname,
            title: document.title || window.location.hostname,
            metaTags,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            },
            userAgent: navigator.userAgent
          };
        }
      });
      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    } catch (err) {
      console.warn("DOM script execution warning (using tab URL):", err);
    }
  }
  return fallbackMetadata;
}
