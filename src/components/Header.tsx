import React from 'react';

interface HeaderProps {
  activeTab: 'ticket' | 'history' | 'mappings' | 'settings';
  onTabChange: (tab: 'ticket' | 'history' | 'mappings' | 'settings') => void;
  isConnected: boolean;
  userName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  isConnected,
  userName,
}) => {
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

      <div
        className="header-user"
        title={isConnected ? `Connected as ${userName || 'User'}` : 'Not connected to Linear'}
      >
        <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
      </div>
    </header>
  );
};
