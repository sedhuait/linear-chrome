import React, { useState, useEffect } from 'react';
import { ExternalLink, Copy, Trash2, Search, Clock, Tag, Globe, Check } from 'lucide-react';
import { SavedTicket } from '../types/linear';
import { StorageService } from '../services/storage';

interface HistoryViewProps {
  showToast: (msg: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ showToast }) => {
  const [tickets, setTickets] = useState<SavedTicket[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadTickets = async () => {
    const list = await StorageService.getPastTickets();
    setTickets(list);
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleCopyLink = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast('Linear link copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    await StorageService.deletePastTicket(id);
    await loadTickets();
    showToast('Ticket removed from history.');
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear your ticket history?')) {
      await StorageService.clearPastTickets();
      await loadTickets();
      showToast('Ticket history cleared.');
    }
  };

  const formatRelativeTime = (timestamp: number): string => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredTickets = tickets.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.identifier.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      (t.pageUrl && t.pageUrl.toLowerCase().includes(q)) ||
      (t.teamName && t.teamName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="history-view">
      <div className="pane-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="pane-title">Created Tickets ({tickets.length})</h3>
            <p className="pane-subtitle">
              All tickets created through this Chrome Extension.
            </p>
          </div>
          {tickets.length > 0 && (
            <button
              type="button"
              className="btn-micro"
              style={{ color: 'var(--accent-red)' }}
              onClick={handleClearAll}
              title="Clear all ticket history"
            >
              <Trash2 size={11} />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {tickets.length > 0 && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search
            size={13}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: 10, top: 9, pointerEvents: 'none' }}
          />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: 30, fontSize: '12px' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by ID, title, or URL..."
          />
        </div>
      )}

      {/* Tickets List */}
      <div className="history-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredTickets.length === 0 ? (
          <div className="empty-state" style={{ padding: '36px 16px', textAlign: 'center' }}>
            <Clock size={28} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>
              {searchQuery ? 'No matching tickets' : 'No tickets created yet'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {searchQuery
                ? 'Try a different search query'
                : 'Tickets you create using this extension will be safely saved and listed here.'}
            </p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              className="history-card"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                transition: 'border-color 0.15s ease',
              }}
            >
              {/* Header row: ID chip, Time, Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <a
                    href={ticket.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      background: 'rgba(94, 106, 210, 0.18)',
                      border: '1px solid rgba(94, 106, 210, 0.4)',
                      borderRadius: 4,
                      color: '#8B97FF',
                      fontWeight: 700,
                      fontSize: '11px',
                      textDecoration: 'none',
                    }}
                    title="Open ticket in Linear"
                  >
                    <span>{ticket.identifier}</span>
                    <ExternalLink size={10} />
                  </a>

                  {ticket.ticketType && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {ticket.ticketType}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-faint)' }}>
                    {formatRelativeTime(ticket.createdAt)}
                  </span>
                  <button
                    type="button"
                    className="btn-micro"
                    onClick={() => handleCopyLink(ticket.url, ticket.id)}
                    title="Copy Linear URL"
                  >
                    {copiedId === ticket.id ? <Check size={11} color="#38EF7D" /> : <Copy size={11} />}
                    <span>{copiedId === ticket.id ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-icon-danger"
                    style={{ padding: '2px 4px' }}
                    onClick={() => handleDelete(ticket.id)}
                    title="Remove from history"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {/* Title */}
              <a
                href={ticket.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: 'var(--text-main)',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  textDecoration: 'none',
                  lineHeight: 1.3,
                }}
              >
                {ticket.title}
              </a>

              {/* Source page URL & Labels */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {ticket.pageUrl && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '10.5px',
                      color: 'var(--text-muted)',
                      maxWidth: '240px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={ticket.pageUrl}
                  >
                    <Globe size={10} color="#5E6AD2" />
                    <span>{ticket.pageUrl.replace(/^https?:\/\//, '')}</span>
                  </span>
                )}

                {ticket.labels && ticket.labels.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginLeft: 'auto' }}>
                    {ticket.labels.map((lbl, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: '9.5px',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#A0A6BD',
                        }}
                      >
                        <Tag size={8} />
                        <span>{lbl}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
