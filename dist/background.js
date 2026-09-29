async function applyDisplayMode(mode) {
  try {
    if (mode === "floating") {
      if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {
        });
      }
      await chrome.action.setPopup({ popup: "src/popup/popup.html" }).catch(() => {
      });
    } else {
      if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
        });
      }
      await chrome.action.setPopup({ popup: "" }).catch(() => {
      });
    }
  } catch (err) {
    console.warn("Could not apply display mode:", err);
  }
}
chrome.storage.local.get(["linear_settings"]).then((res) => {
  const mode = res.linear_settings?.displayMode || "fixed";
  applyDisplayMode(mode);
});
chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.local.get(["linear_settings"]);
  const mode = existing.linear_settings?.displayMode || "fixed";
  await applyDisplayMode(mode);
  if (details.reason === "install") {
    if (!existing.linear_settings) {
      await chrome.storage.local.set({
        linear_settings: {
          includeScreenshotByDefault: true,
          includeEnvInfo: true,
          defaultTicketType: "Bug",
          autoCaptureOnOpen: true,
          rememberLastSelectedPerDomain: true,
          displayMode: "fixed"
        }
      });
    }
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SET_DISPLAY_MODE") {
    applyDisplayMode(message.mode).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === "OPEN_SIDE_PANEL") {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const tab = tabs[0] || tabs[tabs.length - 1];
        if (tab?.id) {
          chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
          });
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }
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
  if (message.type === "GET_NETWORK_LOGS") {
    getTabNetworkLogs(message.tabId).then((logs) => sendResponse({ success: true, logs })).catch((err) => sendResponse({ success: false, error: err.message, logs: [] }));
    return true;
  }
});
async function getTabNetworkLogs(tabId) {
  let targetTabId = tabId;
  if (!targetTabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = tabs[0]?.id || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
  }
  if (!targetTabId) return [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: "MAIN",
      func: () => {
        return window.__LINEAR_NETWORK_LOGS__ || [];
      }
    });
    if (results && results[0] && Array.isArray(results[0].result)) {
      return results[0].result;
    }
  } catch (err) {
    console.warn("Could not read network logs from page:", err);
  }
  return [];
}
async function extractActiveTabMetadata(tabId) {
  let targetTab;
  if (tabId) {
    try {
      targetTab = await chrome.tabs.get(tabId);
    } catch {
    }
  }
  if (!targetTab) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTab = tabs[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
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
    pageTitle: tabTitle || urlObj?.hostname || "Untitled Page",
    rawTitle: tabTitle,
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
          let headingText = "";
          const headings = Array.from(
            document.querySelectorAll(
              'main h1, [role="main"] h1, header h1, h1, h2, .page-title, [data-testid="page-title"]'
            )
          );
          for (const h of headings) {
            const text = h.innerText?.trim();
            if (text && text.length >= 2 && text.length <= 120 && !text.includes("\n")) {
              headingText = text;
              break;
            }
          }
          const rawDocTitle = document.title?.trim() || "";
          const ogTitle = metaTags["og:title"] || metaTags["twitter:title"] || metaTags["title"];
          let resolvedPageTitle = "";
          if (headingText) {
            resolvedPageTitle = headingText;
          } else if (ogTitle && ogTitle !== window.location.hostname) {
            resolvedPageTitle = ogTitle;
          } else if (rawDocTitle) {
            const parts = rawDocTitle.split(/\s+[|\-–—·:]\s+/).map((p) => p.trim()).filter(Boolean);
            if (parts.length > 1) {
              resolvedPageTitle = parts[0];
            } else {
              resolvedPageTitle = rawDocTitle;
            }
          }
          if (!resolvedPageTitle || resolvedPageTitle.toLowerCase() === window.location.hostname.toLowerCase()) {
            const segments = window.location.pathname.split("/").filter(Boolean);
            if (segments.length > 0) {
              resolvedPageTitle = segments[segments.length - 1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            } else {
              resolvedPageTitle = window.location.hostname;
            }
          }
          return {
            url: window.location.href,
            // full URL including path, query string, hash
            origin: window.location.origin,
            hostname: window.location.hostname,
            pathname: window.location.pathname,
            title: resolvedPageTitle,
            pageTitle: resolvedPageTitle,
            rawTitle: rawDocTitle,
            heading: headingText,
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
