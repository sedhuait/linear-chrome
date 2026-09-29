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
}
