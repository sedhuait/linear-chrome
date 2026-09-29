import React from 'react';
import { PanelRight, Layers } from 'lucide-react';

interface HeaderProps {
  activeTab: 'ticket' | 'history' | 'mappings' | 'settings';
  onTabChange: (tab: 'ticket' | 'history' | 'mappings' | 'settings') => void;
  isConnected: boolean;
  userName?: string;
  displayMode?: 'fixed' | 'floating';
  onToggleDisplayMode?: (mode: 'fixed' | 'floating') => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  isConnected,
  userName,
  displayMode = 'fixed',
  onToggleDisplayMode,
}) => {
  const isFixed = displayMode !== 'floating';

  const handleToggle = () => {
    const nextMode = isFixed ? 'floating' : 'fixed';
    if (onToggleDisplayMode) {
      onToggleDisplayMode(nextMode);
    } else {
      chrome.runtime.sendMessage({ type: 'SET_DISPLAY_MODE', mode: nextMode });
    }
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <svg className="brand-logo" viewBox="0 0 128 128" width="18" height="18">
          <rect x="8" y="8" width="112" height="112" rx="28" fill="#5E6AD2" />
          <circle cx="64" cy="64" r="32" stroke="#FFFFFF" strokeWidth="6" fill="none" />
          <circle cx="64" cy="64" r="14" fill="#FFFFFF" />
          <circle cx="94" cy="34" r="7" fill="#38EF7D" />
        </svg>
        <span className="app-name">Linear</span>
      </div>

      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'ticket' ? 'active' : ''}`}
          onClick={() => onTabChange('ticket')}
        >
          Ticket
        </button>
        <button
          className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onTabChange('history')}
        >
          History
        </button>
        <button
          className={`nav-tab ${activeTab === 'mappings' ? 'active' : ''}`}
          onClick={() => onTabChange('mappings')}
        >
          Mappings
        </button>
        <button
          className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          Settings
        </button>
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          className="btn-micro"
          style={{
            fontSize: '10.5px',
            padding: '2px 6px',
            border: isFixed ? '1px solid #5E6AD2' : '1px solid #26B5CE',
            background: isFixed ? 'rgba(94, 106, 210, 0.2)' : 'rgba(38, 181, 206, 0.2)',
            color: isFixed ? '#8B97FF' : '#26B5CE',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontWeight: 600,
          }}
          onClick={handleToggle}
          title={
            isFixed
              ? 'Currently in Fixed Side Panel mode. Click to switch to Floating Popup.'
              : 'Currently in Floating Popup mode. Click to switch to Fixed Side Panel.'
          }
        >
          {isFixed ? <PanelRight size={11} color="#8B97FF" /> : <Layers size={11} color="#26B5CE" />}
          <span>{isFixed ? 'Fixed' : 'Floating'}</span>
        </button>

        <div
          className="header-user"
          title={isConnected ? `Connected as ${userName || 'User'}` : 'Not connected to Linear'}
        >
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        </div>
      </div>
    </header>
  );
};
