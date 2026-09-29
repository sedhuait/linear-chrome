import { PageMetadata } from '../types/mapping';
import { NetworkLogEntry } from '../types/network';
import { isUrlAllowed, normalizeDomainInput } from '../utils/domain';

const SIDE_PANEL_PATH = 'src/popup/popup.html';

async function configureSidePanel(mode: 'fixed' | 'floating', tabId?: number) {
  if (!chrome.sidePanel) return;
  try {
    if (mode === 'fixed') {
      if (chrome.sidePanel.setPanelBehavior) {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
      }
      if (chrome.sidePanel.setOptions) {
        // Set globally so default panel behavior is always bound to popup.html
        await chrome.sidePanel.setOptions({
          path: SIDE_PANEL_PATH,
          enabled: true,
        }).catch(() => {});
        // If specific tabId provided, bind it to this tab
        if (typeof tabId === 'number') {
          await chrome.sidePanel.setOptions({
            tabId,
            path: SIDE_PANEL_PATH,
            enabled: true,
          }).catch(() => {});
        }
      }
      await chrome.action.setPopup({ popup: '' }).catch(() => {});
    } else {
      if (chrome.sidePanel.setPanelBehavior) {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
      }
      if (chrome.sidePanel.setOptions) {
        await chrome.sidePanel.setOptions({
          enabled: false,
        }).catch(() => {});
        if (typeof tabId === 'number') {
          await chrome.sidePanel.setOptions({
            tabId,
            enabled: false,
          }).catch(() => {});
        }
      }
      await chrome.action.setPopup({ popup: SIDE_PANEL_PATH }).catch(() => {});
    }
  } catch (err) {
    console.warn('Could not configure side panel:', err);
  }
}

async function applyDisplayMode(mode: 'fixed' | 'floating') {
  try {
    await configureSidePanel(mode);
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        await configureSidePanel(mode, tab.id);
      }
    }
  } catch (err) {
    console.warn('Could not apply display mode across tabs:', err);
  }
}

/**
 * Registers interceptor script ONLY for localhost and whitelisted domains.
 * Ensures the extension never injects scripts into non-whitelisted websites.
 */
async function syncRegisteredScripts(domains: string[] = []) {
  if (!chrome.scripting || !chrome.scripting.registerContentScripts) return;
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const ids = existing.map((s) => s.id);
    if (ids.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids });
    }

    const matches: string[] = [
      'http://localhost/*',
      'https://localhost/*',
      'http://127.0.0.1/*',
      'https://127.0.0.1/*',
    ];

    domains.forEach((d) => {
      const clean = normalizeDomainInput(d);
      if (clean && clean !== 'localhost' && clean !== '127.0.0.1') {
        matches.push(`http://${clean}/*`);
        matches.push(`https://${clean}/*`);
        matches.push(`http://*.${clean}/*`);
        matches.push(`https://*.${clean}/*`);
      }
    });

    await chrome.scripting.registerContentScripts([
      {
        id: 'linear-interceptor',
        matches,
        js: ['interceptor.js'],
        runAt: 'document_start',
        world: 'MAIN',
      },
    ]);
  } catch (err) {
    console.warn('Could not register content scripts dynamically:', err);
  }
}

// Initial display mode & whitelist setup
chrome.storage.local.get(['linear_settings']).then((res) => {
  const mode = res.linear_settings?.displayMode || 'fixed';
  applyDisplayMode(mode);
  const domains = res.linear_settings?.whitelistedDomains || ['localhost', '127.0.0.1'];
  syncRegisteredScripts(domains);
});

// Initialize defaults on installation
chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.local.get(['linear_settings']);
  const mode = existing.linear_settings?.displayMode || 'fixed';
  await applyDisplayMode(mode);
  const domains = existing.linear_settings?.whitelistedDomains || ['localhost', '127.0.0.1'];
  await syncRegisteredScripts(domains);

  if (details.reason === 'install') {
    if (!existing.linear_settings) {
      await chrome.storage.local.set({
        linear_settings: {
          includeScreenshotByDefault: true,
          includeEnvInfo: true,
          defaultTicketType: 'Bug',
          autoCaptureOnOpen: true,
          rememberLastSelectedPerDomain: true,
          displayMode: 'fixed',
          whitelistedDomains: ['localhost', '127.0.0.1'],
        },
      });
    }
  }
});

// Initialize on browser startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    const existing = (await chrome.storage.local.get(['linear_settings']).catch(() => ({}))) as Record<string, any>;
    const mode = existing.linear_settings?.displayMode || 'fixed';
    await applyDisplayMode(mode);
    const domains = existing.linear_settings?.whitelistedDomains || ['localhost', '127.0.0.1'];
    await syncRegisteredScripts(domains);
  } catch (err) {
    console.warn('Startup initialization error:', err);
  }
});

// Ensure side panel is properly attached and configured whenever the active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const res = (await chrome.storage.local.get(['linear_settings']).catch(() => ({}))) as Record<string, any>;
    const mode = res.linear_settings?.displayMode || 'fixed';
    await configureSidePanel(mode, activeInfo.tabId);
  } catch (err) {
    console.warn('Tab activation side panel sync error:', err);
  }
});

// Ensure side panel is re-bound when a tab finishes navigating or updating
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status === 'complete' || Boolean(changeInfo.url))) {
    try {
      const res = (await chrome.storage.local.get(['linear_settings']).catch(() => ({}))) as Record<string, any>;
      const mode = res.linear_settings?.displayMode || 'fixed';
      await configureSidePanel(mode, tabId);
    } catch (err) {
      console.warn('Tab update side panel sync error:', err);
    }
  }
});

// Direct action icon click handler fallback
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const res = (await chrome.storage.local.get(['linear_settings']).catch(() => ({}))) as Record<string, any>;
    const mode = res.linear_settings?.displayMode || 'fixed';
    if (mode === 'fixed' && tab?.id) {
      await configureSidePanel('fixed', tab.id);
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Action click fallback error:', err);
  }
});

// Communication dispatcher
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SET_DISPLAY_MODE') {
    applyDisplayMode(message.mode).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'SYNC_WHITELIST') {
    syncRegisteredScripts(message.domains || []).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'INJECT_INTERCEPTOR') {
    if (message.tabId) {
      chrome.scripting
        .executeScript({
          target: { tabId: message.tabId },
          files: ['interceptor.js'],
          world: 'MAIN',
        })
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true;
    }
  }

  if (message.type === 'OPEN_SIDE_PANEL') {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
        const tab = tabs[0] || tabs[tabs.length - 1];
        if (tab?.id) {
          if (chrome.sidePanel?.setOptions) {
            await chrome.sidePanel.setOptions({
              tabId: tab.id,
              path: SIDE_PANEL_PATH,
              enabled: true,
            }).catch(() => {});
          }
          chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CAPTURE_VISIBLE_TAB') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
        const settingsRes = await chrome.storage.local.get(['linear_settings']);
        const whitelisted = settingsRes.linear_settings?.whitelistedDomains || ['localhost', '127.0.0.1'];
        if (!tab?.url || !isUrlAllowed(tab.url, whitelisted)) {
          sendResponse({ success: false, error: 'DOMAIN_NOT_WHITELISTED' });
          return;
        }
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
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
    })();
    return true;
  }

  if (message.type === 'EXTRACT_PAGE_METADATA') {
    extractActiveTabMetadata(message.tabId)
      .then((metadata) => sendResponse({ success: true, metadata }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_NETWORK_LOGS') {
    getTabNetworkLogs(message.tabId)
      .then((logs) => sendResponse({ success: true, logs }))
      .catch((err) => sendResponse({ success: false, error: err.message, logs: [] }));
    return true;
  }

  if (message.type === 'CLEAR_NETWORK_LOGS') {
    clearTabNetworkLogs(message.tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function getTabNetworkLogs(tabId?: number): Promise<NetworkLogEntry[]> {
  let targetTab: chrome.tabs.Tab | undefined;
  if (tabId) {
    try {
      targetTab = await chrome.tabs.get(tabId);
    } catch {
      // ignore
    }
  }

  if (!targetTab) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTab = tabs[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  }

  if (!targetTab || !targetTab.id || !targetTab.url) return [];

  // Privacy gate: verify tab URL is localhost or whitelisted before reading network logs
  const settingsRes = await chrome.storage.local.get(['linear_settings']);
  const whitelisted = settingsRes.linear_settings?.whitelistedDomains || ['localhost', '127.0.0.1'];
  if (!isUrlAllowed(targetTab.url, whitelisted)) {
    return [];
  }

  const targetTabId = targetTab.id;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: 'MAIN',
      func: () => {
        return window.__LINEAR_NETWORK_LOGS__ || [];
      },
    });

    if (results && results[0] && Array.isArray(results[0].result)) {
      return results[0].result as NetworkLogEntry[];
    }
  } catch (err) {
    console.warn('Could not read network logs from page:', err);
  }

  return [];
}

async function clearTabNetworkLogs(tabId?: number): Promise<void> {
  let targetTab: chrome.tabs.Tab | undefined;
  if (tabId) {
    try {
      targetTab = await chrome.tabs.get(tabId);
    } catch {
      // ignore
    }
  }

  if (!targetTab) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTab = tabs[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  }

  if (!targetTab || !targetTab.id || !targetTab.url) return;

  const settingsRes = await chrome.storage.local.get(['linear_settings']);
  const whitelisted = settingsRes.linear_settings?.whitelistedDomains || ['localhost', '127.0.0.1'];
  if (!isUrlAllowed(targetTab.url, whitelisted)) {
    return;
  }

  const targetTabId = targetTab.id;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: 'MAIN',
      func: () => {
        if (typeof (window as any).__LINEAR_CLEAR_NETWORK_LOGS__ === 'function') {
          (window as any).__LINEAR_CLEAR_NETWORK_LOGS__();
        } else {
          if (Array.isArray((window as any).__LINEAR_NETWORK_LOGS__)) {
            (window as any).__LINEAR_NETWORK_LOGS__.length = 0;
          }
          (window as any).__LINEAR_NETWORK_LOGS__ = [];
        }
      },
    });
  } catch (err) {
    console.warn('Could not clear network logs from page:', err);
  }
}

/**
 * Extracts active tab URL and metadata. Always guarantees tab URL availability.
 */
async function extractActiveTabMetadata(tabId?: number): Promise<PageMetadata> {
  let targetTab: chrome.tabs.Tab | undefined;

  if (tabId) {
    try {
      targetTab = await chrome.tabs.get(tabId);
    } catch {
      // ignore
    }
  }

  if (!targetTab) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTab = tabs[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  }

  if (!targetTab || !targetTab.url) {
    throw new Error('No active browser tab found');
  }

  const tabUrl = targetTab.url;
  const settingsRes = await chrome.storage.local.get(['linear_settings']);
  const whitelisted = settingsRes.linear_settings?.whitelistedDomains || ['localhost', '127.0.0.1'];
  if (!isUrlAllowed(tabUrl, whitelisted)) {
    throw new Error('DOMAIN_NOT_WHITELISTED');
  }

  const tabTitle = targetTab.title || '';
  let urlObj: URL | null = null;
  try {
    urlObj = new URL(tabUrl);
  } catch {
    // fallback
  }

  const fallbackMetadata: PageMetadata = {
    url: tabUrl,
    origin: urlObj?.origin || '',
    hostname: urlObj?.hostname || '',
    pathname: urlObj?.pathname || '',
    title: tabTitle || urlObj?.hostname || 'Untitled Page',
    pageTitle: tabTitle || urlObj?.hostname || 'Untitled Page',
    rawTitle: tabTitle,
    metaTags: {},
    viewport: {
      width: targetTab.width || 0,
      height: targetTab.height || 0,
    },
    userAgent: navigator.userAgent,
  };

  // Attempt DOM inspection for rich meta tags, h1 headings, and document details
  if (targetTab.id && !tabUrl.startsWith('chrome://') && !tabUrl.startsWith('chrome-extension://')) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
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

          // Extract visible main heading on page (e.g. "Businesses")
          let headingText = '';
          const headings = Array.from(
            document.querySelectorAll(
              'main h1, [role="main"] h1, header h1, h1, h2, .page-title, [data-testid="page-title"]'
            )
          );
          for (const h of headings) {
            const text = (h as HTMLElement).innerText?.trim();
            if (text && text.length >= 2 && text.length <= 120 && !text.includes('\n')) {
              headingText = text;
              break;
            }
          }

          const rawDocTitle = document.title?.trim() || '';
          const ogTitle = metaTags['og:title'] || metaTags['twitter:title'] || metaTags['title'];

          // Determine specific page title (distinguish between app/site name and route page title)
          let resolvedPageTitle = '';

          // 1. If an h1 heading is found on the page (like "Businesses"), this is almost always the true page title
          if (headingText) {
            resolvedPageTitle = headingText;
          } else if (ogTitle && ogTitle !== window.location.hostname) {
            resolvedPageTitle = ogTitle;
          } else if (rawDocTitle) {
            // Clean common patterns like "Businesses | EasyDP", "Businesses - EasyDP", "EasyDP - Businesses"
            const parts = rawDocTitle.split(/\s+[|\-–—·:]\s+/).map((p) => p.trim()).filter(Boolean);
            if (parts.length > 1) {
              resolvedPageTitle = parts[0];
            } else {
              resolvedPageTitle = rawDocTitle;
            }
          }

          // Fallback to pathname segment if title is still empty or equals the domain
          if (!resolvedPageTitle || resolvedPageTitle.toLowerCase() === window.location.hostname.toLowerCase()) {
            const segments = window.location.pathname.split('/').filter(Boolean);
            if (segments.length > 0) {
              resolvedPageTitle = segments[segments.length - 1]
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());
            } else {
              resolvedPageTitle = window.location.hostname;
            }
          }

          return {
            url: window.location.href, // full URL including path, query string, hash
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
              height: window.innerHeight,
            },
            userAgent: navigator.userAgent,
          };
        },
      });

      if (results && results[0] && results[0].result) {
        return results[0].result as PageMetadata;
      }
    } catch (err) {
      console.warn('DOM script execution warning (using tab URL):', err);
    }
  }

  return fallbackMetadata;
}
