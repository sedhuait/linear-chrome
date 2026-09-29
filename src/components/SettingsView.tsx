import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  ShieldCheck,
  ExternalLink,
  PanelRight,
  Layers,
  Shield,
  Plus,
  Trash2,
  Lock,
} from 'lucide-react';
import { ExtensionSettings, StorageService } from '../services/storage';
import { LinearWorkspaceData } from '../types/linear';
import { LinearApiClient } from '../services/linear-api';
import { normalizeDomainInput } from '../utils/domain';

interface SettingsViewProps {
  workspace: LinearWorkspaceData | null;
  settings: ExtensionSettings;
  onSettingsUpdated: (settings: ExtensionSettings) => void;
  onKeySaved: (key: string) => Promise<void>;
  showToast: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  workspace,
  settings,
  onSettingsUpdated,
  onKeySaved,
  showToast,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<LinearWorkspaceData | null>(workspace);
  const [newDomainInput, setNewDomainInput] = useState('');

  useEffect(() => {
    StorageService.getApiKey().then((k) => setApiKey(k));
  }, []);

  useEffect(() => {
    if (workspace) setVerifiedUser(workspace);
  }, [workspace]);

  const handleVerify = async () => {
    if (!apiKey.trim()) {
      showToast('Enter an API key first.');
      return;
    }
    setIsVerifying(true);
    try {
      const client = new LinearApiClient(apiKey.trim());
      const data = await client.getWorkspaceData();
      setVerifiedUser(data);
      showToast(`Verified! Connected as ${data.viewer.name}`);
    } catch (err) {
      showToast('Verification failed: ' + (err as Error).message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveKey = async () => {
    await onKeySaved(apiKey.trim());
    showToast('Linear API key saved.');
  };

  const handleDisplayModeChange = async (mode: 'fixed' | 'floating') => {
    const updated = { ...settings, displayMode: mode };
    await StorageService.saveSettings(updated);
    try {
      await chrome.runtime.sendMessage({ type: 'SET_DISPLAY_MODE', mode });
    } catch {
      // ignore
    }
    onSettingsUpdated(updated);
    showToast(`Display mode set to ${mode === 'fixed' ? 'Fixed Side Panel' : 'Floating Popup'}`);
    if (mode === 'fixed') {
      try {
        await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      } catch {
        // ignore
      }
    }
  };

  const handleAddDomain = async () => {
    const clean = normalizeDomainInput(newDomainInput);
    if (!clean) {
      showToast('Enter a valid domain name (e.g. app.easydp.internal)');
      return;
    }
    const current = settings.whitelistedDomains || ['localhost', '127.0.0.1'];
    if (current.includes(clean)) {
      showToast('Domain is already in the whitelist');
      return;
    }
    const updated = await StorageService.addWhitelistedDomain(clean);
    const updatedSettings = { ...settings, whitelistedDomains: updated };
    onSettingsUpdated(updatedSettings);
    try {
      await chrome.runtime.sendMessage({ type: 'SYNC_WHITELIST', domains: updated });
    } catch {
      // ignore
    }
    setNewDomainInput('');
    showToast(`Added "${clean}" to whitelist`);
  };

  const handleRemoveDomain = async (domain: string) => {
    const updated = await StorageService.removeWhitelistedDomain(domain);
    const updatedSettings = { ...settings, whitelistedDomains: updated };
    onSettingsUpdated(updatedSettings);
    try {
      await chrome.runtime.sendMessage({ type: 'SYNC_WHITELIST', domains: updated });
    } catch {
      // ignore
    }
    showToast(`Removed "${domain}" from whitelist`);
  };

  const handlePrefChange = async (key: keyof ExtensionSettings, val: boolean) => {
    const updated = { ...settings, [key]: val };
    await StorageService.saveSettings(updated);
    onSettingsUpdated(updated);
  };

  return (
    <div className="settings-view">
      <div className="pane-header">
        <h3 className="pane-title">Linear Configuration</h3>
        <p className="pane-subtitle">
          Manage your Linear Personal API Key and extension preferences.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Linear Personal API Key</label>
        <div className="input-action-row">
          <input
            type={showKey ? 'text' : 'password'}
            className="form-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="lin_api_..."
          />
          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowKey(!showKey)}
            title={showKey ? 'Hide Key' : 'Show Key'}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="field-hint">
          Generate an API key with <strong>write</strong> scope at{' '}
          <a
            href="https://linear.app/settings/api"
            target="_blank"
            rel="noreferrer"
            className="hint-link"
          >
            Linear Settings → API → Personal API keys
            <ExternalLink size={10} style={{ marginLeft: 3 }} />
          </a>
        </p>
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleVerify}
          disabled={isVerifying}
        >
          {isVerifying ? 'Verifying...' : 'Verify Connection'}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSaveKey}>
          Save Key
        </button>
      </div>

      {verifiedUser && (
        <div className="connection-status-box">
          <div className="status-avatar">
            {verifiedUser.viewer.name.charAt(0).toUpperCase()}
          </div>
          <div className="status-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>{verifiedUser.viewer.name}</strong>
              <ShieldCheck size={14} color="#38EF7D" />
            </div>
            <span>{verifiedUser.viewer.email}</span>
            <span className="status-stats">
              {verifiedUser.teams.length} Teams · {verifiedUser.projects.length} Projects
            </span>
          </div>
        </div>
      )}

      <hr className="separator" />

      <h4 className="section-title">Display Mode</h4>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Choose how the Linear extension opens when you click its icon in the Chrome toolbar.
      </p>

      <div className="display-mode-selector">
        <button
          type="button"
          className={`mode-card ${settings.displayMode !== 'floating' ? 'active' : ''}`}
          onClick={() => handleDisplayModeChange('fixed')}
        >
          <div className="mode-card-header">
            <PanelRight size={16} color={settings.displayMode !== 'floating' ? '#5E6AD2' : '#8B90A4'} />
            <strong className="mode-card-title">Fixed Side Panel</strong>
            {settings.displayMode !== 'floating' && <span className="mode-badge">Active</span>}
          </div>
          <p className="mode-card-desc">
            Permanently docked to the right edge of Chrome. Stays visible while you browse, navigate, and inspect page elements.
          </p>
        </button>

        <button
          type="button"
          className={`mode-card ${settings.displayMode === 'floating' ? 'active' : ''}`}
          onClick={() => handleDisplayModeChange('floating')}
        >
          <div className="mode-card-header">
            <Layers size={16} color={settings.displayMode === 'floating' ? '#26B5CE' : '#8B90A4'} />
            <strong className="mode-card-title">Floating Popup</strong>
            {settings.displayMode === 'floating' && (
              <span className="mode-badge" style={{ background: 'rgba(38, 181, 206, 0.15)', color: '#26B5CE' }}>
                Active
              </span>
            )}
          </div>
          <p className="mode-card-desc">
            Fast dropdown popover directly below the extension icon. Automatically closes when you click outside.
          </p>
        </button>
      </div>

      <hr className="separator" />

      <h4 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Shield size={15} color="#5E6AD2" />
        <span>Allowed Domains & Privacy</span>
      </h4>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        To prevent reading private or unapproved websites, the extension only captures screenshots,
        page DOM metadata, and API network logs on localhost and the domains below.
      </p>

      <div className="add-domain-row" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          className="form-input"
          style={{ flex: 1 }}
          placeholder="e.g. app.easydp.internal or mydomain.com"
          value={newDomainInput}
          onChange={(e) => setNewDomainInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddDomain();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleAddDomain}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Plus size={14} />
          <span>Add</span>
        </button>
      </div>

      <div className="whitelisted-domains-list">
        {(settings.whitelistedDomains || ['localhost', '127.0.0.1']).map((domain) => {
          const isSystem = domain === 'localhost' || domain === '127.0.0.1';
          return (
            <div key={domain} className="whitelisted-domain-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isSystem ? (
                  <Lock size={12} color="#8B90A4" />
                ) : (
                  <ShieldCheck size={12} color="#38EF7D" />
                )}
                <span className="domain-text">{domain}</span>
              </div>
              {isSystem ? (
                <span className="system-pill">Default</span>
              ) : (
                <button
                  type="button"
                  className="btn-icon-subtle danger"
                  title={`Remove ${domain} from whitelist`}
                  onClick={() => handleRemoveDomain(domain)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <hr className="separator" />

      <h4 className="section-title">Preferences</h4>
      <div className="preferences-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.autoCaptureOnOpen}
            onChange={(e) => handlePrefChange('autoCaptureOnOpen', e.target.checked)}
          />
          <span>Auto-capture screenshot when opening popup</span>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.includeEnvInfo}
            onChange={(e) => handlePrefChange('includeEnvInfo', e.target.checked)}
          />
          <span>Include page URL, viewport, and browser info in description</span>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.rememberLastSelectedPerDomain}
            onChange={(e) => handlePrefChange('rememberLastSelectedPerDomain', e.target.checked)}
          />
          <span>Automatically remember selected project per domain</span>
        </label>
      </div>
    </div>
  );
};
