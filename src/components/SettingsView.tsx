import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ShieldCheck, ExternalLink } from 'lucide-react';
import { ExtensionSettings, StorageService } from '../services/storage';
import { LinearWorkspaceData } from '../types/linear';
import { LinearApiClient } from '../services/linear-api';

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
          Generate an API key at{' '}
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
