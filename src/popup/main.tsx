import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from './PopupApp';
import './popup.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Linear Extension caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 20,
            color: '#f2f4f8',
            background: '#0e1017',
            height: '100vh',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            fontFamily: '-apple-system, sans-serif',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Something went wrong</h3>
          <p
            style={{
              fontSize: 12,
              color: '#8b90a4',
              marginBottom: 16,
              maxWidth: 320,
              wordBreak: 'break-word',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '8px 12px',
              borderRadius: 6,
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred while loading.'}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: '#5e6ad2',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            Reload Extension
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global emergency handlers to catch any errors outside React's render lifecycle
function renderGlobalFallbackError(errorMsg: string) {
  const rootElement = document.getElementById('root');
  if (rootElement && (!rootElement.children || rootElement.children.length === 0)) {
    rootElement.innerHTML = `
      <div style="padding: 24px; color: #f2f4f8; background-color: #0e1017; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-family: -apple-system, sans-serif;">
        <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
        <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #f2f4f8;">Failed to initialize</h3>
        <p style="font-size: 12px; color: #8b90a4; margin-bottom: 16px; max-width: 320px; word-break: break-word; background: rgba(255, 255, 255, 0.05); padding: 8px 12px; border-radius: 6px;">
          ${document.createElement('div').appendChild(document.createTextNode(errorMsg)).parentNode?.textContent || 'Initialization error'}
        </p>
        <button id="reload-btn" style="padding: 8px 16px; border-radius: 6px; background: #5e6ad2; color: #fff; border: none; cursor: pointer; font-weight: 600; font-size: 12px;">
          Reload Extension
        </button>
      </div>
    `;
    document.getElementById('reload-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

window.addEventListener('error', (event) => {
  console.error('Unhandled extension error:', event.error || event.message);
  renderGlobalFallbackError(event.error?.message || String(event.message || 'Script error'));
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled extension promise rejection:', event.reason);
  renderGlobalFallbackError(event.reason?.message || String(event.reason || 'Unhandled Promise Rejection'));
});

function initApp() {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <PopupApp />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } else {
    console.error('Could not find #root element to mount extension UI');
    renderGlobalFallbackError('Root container #root not found');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
