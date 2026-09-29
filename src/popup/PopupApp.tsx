import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/Header';
import { CreateTicketView } from '../components/CreateTicketView';
import { MappingsManagerView } from '../components/MappingsManagerView';
import { SettingsView } from '../components/SettingsView';
import { LinearApiClient } from '../services/linear-api';
import { MappingEngine } from '../services/mapping-engine';
import { ExtensionSettings, StorageService } from '../services/storage';
import { LinearWorkspaceData } from '../types/linear';
import { MappingRule, PageMetadata } from '../types/mapping';

export const PopupApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ticket' | 'mappings' | 'settings'>('ticket');
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
  });
  const [matchedRule, setMatchedRule] = useState<MappingRule | null>(null);
  const [matchReason, setMatchReason] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

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
            showToast={showToast}
          />
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
