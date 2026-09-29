import { PageMetadata } from '../types/mapping';

// Initialize defaults on installation
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const existing = await chrome.storage.local.get(['linear_settings']);
    if (!existing.linear_settings) {
      await chrome.storage.local.set({
        linear_settings: {
          includeScreenshotByDefault: true,
          includeEnvInfo: true,
          defaultTicketType: 'Bug',
          autoCaptureOnOpen: true,
          rememberLastSelectedPerDomain: true,
        },
      });
    }
  }
});

// Communication dispatcher
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_VISIBLE_TAB') {
    chrome.tabs.captureVisibleTab(
      message.windowId || chrome.windows.WINDOW_ID_CURRENT,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, dataUrl });
        }
      }
    );
    return true; // Keep message channel open for async response
  }

  if (message.type === 'EXTRACT_PAGE_METADATA') {
    extractActiveTabMetadata(message.tabId)
      .then((metadata) => sendResponse({ success: true, metadata }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Executes a lightweight script inside the active tab to extract metadata and meta tags.
 */
async function extractActiveTabMetadata(tabId?: number): Promise<PageMetadata> {
  const targetTabId = tabId || (await getActiveTabId());
  if (!targetTabId) {
    throw new Error('No active browser tab found');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: () => {
      const metaTags: Record<string, string> = {};
      const metas = document.querySelectorAll('meta');
      metas.forEach((m) => {
        const key = m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('itemprop');
        const content = m.getAttribute('content');
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
          height: window.innerHeight,
        },
        userAgent: navigator.userAgent,
      };
    },
  });

  if (!results || !results[0] || !results[0].result) {
    throw new Error('Failed to extract page context from tab.');
  }

  return results[0].result as PageMetadata;
}

async function getActiveTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}
