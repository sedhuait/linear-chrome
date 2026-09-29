import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/Header';
import { CreateTicketView } from '../components/CreateTicketView';
import { HistoryView } from '../components/HistoryView';
import { MappingsManagerView } from '../components/MappingsManagerView';
import { SettingsView } from '../components/SettingsView';
import { LinearApiClient } from '../services/linear-api';
import { MappingEngine } from '../services/mapping-engine';
import { ExtensionSettings, StorageService } from '../services/storage';
import { LinearWorkspaceData } from '../types/linear';
import { MappingRule, PageMetadata } from '../types/mapping';

export const PopupApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ticket' | 'history' | 'mappings' | 'settings'>('ticket');
  const [linearClient, setLinearClient] = useState<LinearApiClient | null>(null);
  const [workspace, setWorkspace] = useState<LinearWorkspaceData | null>(null);
  const [pageMetadata, setPageMetadata] = useState<PageMetadata | null>(null);
  const [rules, setRules] = useState<MappingRule[]>([]);
  const [settings, setSettings] = useState<ExtensionSettings>({
    includeScreenshotByDefault: true,
    includeEnvInfo: true,
    defaultTicketType: 'Bug',
    autoCaptureOnOpen: true,
    rememberLastSelectedPerDomain: true,
    displayMode: 'fixed',
  });
  const [matchedRule, setMatchedRule] = useState<MappingRule | null>(null);
  const [matchReason, setMatchReason] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync document body class for fixed vs floating dimensions
  useEffect(() => {
    document.body.className = settings.displayMode === 'floating' ? 'mode-floating' : 'mode-fixed';
  }, [settings.displayMode]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const handleToggleDisplayMode = async (nextMode: 'fixed' | 'floating') => {
    const updated = { ...settings, displayMode: nextMode };
    setSettings(updated);
    await StorageService.saveSettings({ displayMode: nextMode });
    try {
      await chrome.runtime.sendMessage({ type: 'SET_DISPLAY_MODE', mode: nextMode });
    } catch {
      // ignore
    }
    showToast(`Switched to ${nextMode === 'fixed' ? 'Fixed Side Panel' : 'Floating Popup'} mode`);
    if (nextMode === 'fixed') {
      try {
        await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      } catch {
        // ignore
      }
    }
  };

  // Load storage & connection
  const loadConnection = useCallback(async (key?: string) => {
    const apiKey = key ?? (await StorageService.getApiKey());
    if (!apiKey) {
      setLinearClient(null);
      setWorkspace(null);
      return;
    }

    const client = new LinearApiClient(apiKey);
    setLinearClient(client);
    try {
      const data = await client.getWorkspaceData();
      setWorkspace(data);
    } catch (err) {
      console.warn('Linear connection error:', err);
      showToast('Linear connection error: ' + (err as Error).message);
    }
  }, [showToast]);

  // Load page metadata & mapping
  const loadPageContext = useCallback(async (currentRules: MappingRule[]) => {
    try {
      // 1. Immediate tab query to get the active URL
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
      if (activeTab && activeTab.url) {
        let urlObj: URL | null = null;
        try {
          urlObj = new URL(activeTab.url);
        } catch {
          // ignore
        }
        const initialMeta: PageMetadata = {
          url: activeTab.url,
          origin: urlObj?.origin || '',
          hostname: urlObj?.hostname || '',
          pathname: urlObj?.pathname || '',
          title: activeTab.title || 'Untitled Page',
          metaTags: {},
          viewport: { width: activeTab.width || 0, height: activeTab.height || 0 },
          userAgent: navigator.userAgent,
        };
        setPageMetadata(initialMeta);

        const initialMatch = await MappingEngine.resolveProjectMapping(initialMeta, currentRules);
        if (initialMatch.matched && initialMatch.rule) {
          setMatchedRule(initialMatch.rule);
          setMatchReason(initialMatch.matchReason || '');
        }
      }

      // 2. Fetch full DOM metadata and meta tags
      const res = await chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE_METADATA' });
      if (res && res.success && res.metadata) {
        const meta = res.metadata as PageMetadata;
        setPageMetadata(meta);

        // Resolve mapping
        const result = await MappingEngine.resolveProjectMapping(meta, currentRules);
        if (result.matched && result.rule) {
          setMatchedRule(result.rule);
          setMatchReason(result.matchReason || '');
        } else {
          setMatchedRule(null);
          setMatchReason('');
        }
      }
    } catch (e) {
      console.warn('Could not inspect page tab:', e);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const s = await StorageService.getSettings();
      setSettings(s);
      const r = await StorageService.getMappingRules();
      setRules(r);
      await loadConnection();
      await loadPageContext(r);
    }
    init();
  }, [loadConnection, loadPageContext]);

  // Listen for tab switching and navigation so fixed side panel stays in sync with active tab
  useEffect(() => {
    const handleTabActivated = () => {
      loadPageContext(rules);
    };

    const handleTabUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab?: chrome.tabs.Tab) => {
      // Only reload context if the active tab is being navigated/updated
      if ((!tab || tab.active) && (changeInfo.status === 'complete' || Boolean(changeInfo.url))) {
        loadPageContext(rules);
      }
    };

    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(handleTabActivated);
    }
    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(handleTabUpdated);
    }

    return () => {
      if (chrome.tabs && chrome.tabs.onActivated) {
        chrome.tabs.onActivated.removeListener(handleTabActivated);
      }
      if (chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      }
    };
  }, [rules, loadPageContext]);

  const handleKeySaved = async (newKey: string) => {
    await StorageService.setApiKey(newKey);
    await loadConnection(newKey);
  };

  const handleRulesUpdated = async (newRules: MappingRule[]) => {
    setRules(newRules);
    if (pageMetadata) {
      const res = await MappingEngine.resolveProjectMapping(pageMetadata, newRules);
      setMatchedRule(res.matched && res.rule ? res.rule : null);
      setMatchReason(res.matchReason || '');
    }
  };

  return (
    <div className="popup-container">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isConnected={Boolean(workspace)}
        userName={workspace?.viewer.name}
        displayMode={settings.displayMode}
        onToggleDisplayMode={handleToggleDisplayMode}
      />

      <main className="popup-content">
        {activeTab === 'ticket' && (
          <CreateTicketView
            linearClient={linearClient}
            workspace={workspace}
            pageMetadata={pageMetadata}
            settings={settings}
            matchedRule={matchedRule}
            matchReason={matchReason}
            onOpenSettings={() => setActiveTab('settings')}
            onSaveAsRule={() => setActiveTab('mappings')}
            onViewHistory={() => setActiveTab('history')}
            showToast={showToast}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView showToast={showToast} />
        )}

        {activeTab === 'mappings' && (
          <MappingsManagerView
            pageMetadata={pageMetadata}
            workspace={workspace}
            rules={rules}
            onRulesUpdated={handleRulesUpdated}
            showToast={showToast}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            workspace={workspace}
            settings={settings}
            onSettingsUpdated={setSettings}
            onKeySaved={handleKeySaved}
            showToast={showToast}
          />
        )}
      </main>

      {/* Global Toast */}
      {toastMessage && (
        <div className="popup-toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
