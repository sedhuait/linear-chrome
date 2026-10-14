import React, { useState, useEffect, useCallback } from 'react';
import { ExternalLink, Copy, Trash2, Search, Clock, Tag, Globe, Check, RefreshCw } from 'lucide-react';
import { SavedTicket, LinearWorkflowState } from '../types/linear';
import { LinearApiClient } from '../services/linear-api';
import { StorageService } from '../services/storage';

interface HistoryViewProps {
  linearClient?: LinearApiClient | null;
  showToast: (msg: string) => void;
}

export type StatusFilter = 'open' | 'closed' | 'all';

// Helper to determine if a ticket is in a closed/resolved state
export const isClosedState = (state?: LinearWorkflowState | null): boolean => {
  if (!state) return false;
  const type = state.type?.toLowerCase() || '';
  const name = state.name?.toLowerCase() || '';
  return (
    type === 'completed' ||
    type === 'canceled' ||
    name === 'done' ||
    name === 'completed' ||
    name === 'canceled' ||
    name === 'cancelled' ||
    name === 'duplicate' ||
    name === 'closed'
  );
};

// Helper to determine if a ticket is open / pending
export const isOpenState = (state?: LinearWorkflowState | null): boolean => {
  return !isClosedState(state);
};

// Helper to get intuitive status indicator icon
export const getStateIcon = (type?: string, name?: string): string => {
  const t = type?.toLowerCase() || '';
  const n = name?.toLowerCase() || '';
  if (t === 'backlog' || n.includes('backlog')) return '📥';
  if (t === 'unstarted' || n.includes('todo') || n.includes('to do')) return '📋';
  if (t === 'started' || n.includes('progress') || n.includes('doing')) return '⚡';
  if (t === 'completed' || n.includes('done') || n.includes('complete')) return '✅';
  if (t === 'canceled' || n.includes('cancel')) return '🚫';
  if (t === 'triage') return '🔍';
  return '⚪';
};

export const HistoryView: React.FC<HistoryViewProps> = ({ linearClient, showToast }) => {
  const [tickets, setTickets] = useState<SavedTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const loadTickets = useCallback(async () => {
    const list = await StorageService.getPastTickets();
    setTickets(list);
    return list;
  }, []);

  // Smart Batch Status Sync:
  // 1. Permanently ignores closed tickets (never fetches them again).
  // 2. Only checks open/pending tickets that haven't been checked in the last 5 minutes.
  // 3. Batches all candidate IDs into a SINGLE bulk GraphQL query.
  const syncStatuses = useCallback(
    async (forceRefresh = false) => {
      if (!linearClient) return;

      const currentTickets = await StorageService.getPastTickets();
      if (currentTickets.length === 0) return;

      const now = Date.now();
      const SYNC_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

      // Filter to only tickets needing an update:
      // - Closed tickets are permanently ignored.
      // - Open tickets are only checked if older than TTL or state is missing.
      const candidates = currentTickets.filter((t) => {
        if (isClosedState(t.state)) {
          return false; // Once closed, never fetch again
        }
        if (forceRefresh) {
          return true;
        }
        const lastChecked = t.stateCheckedAt || 0;
        return !t.state || now - lastChecked > SYNC_TTL_MS;
      });

      if (candidates.length === 0) {
        if (forceRefresh) {
          showToast('All open tickets are already up to date');
        }
        return;
      }

      setIsSyncing(true);
      try {
        const candidateIds = candidates.map((t) => t.id);
        // Single bulk GraphQL request
        const stateMap = await linearClient.getIssuesStates(candidateIds);

        if (stateMap.size > 0) {
          const updated = currentTickets.map((t) => {
            const update = stateMap.get(t.id);
            if (update) {
              return {
                ...t,
                state: update.state,
                title: update.title || t.title,
                stateCheckedAt: now,
              };
            }
            if (candidateIds.includes(t.id)) {
              return { ...t, stateCheckedAt: now };
            }
            return t;
          });

          setTickets(updated);
          await StorageService.updatePastTickets(updated);
          if (forceRefresh) {
            showToast('✓ Updated ticket statuses from Linear');
          }
        } else if (forceRefresh) {
          showToast('No status changes found');
        }
      } catch (err) {
        console.warn('Status sync error:', err);
      } finally {
        setIsSyncing(false);
      }
    },
    [linearClient, showToast]
  );

  useEffect(() => {
    loadTickets().then(() => {
      // Background smart sync on mount (only checks stale open tickets)
      syncStatuses(false);
    });
  }, [loadTickets, syncStatuses]);

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

  const openCount = tickets.filter((t) => isOpenState(t.state)).length;
  const closedCount = tickets.filter((t) => isClosedState(t.state)).length;
  const allCount = tickets.length;

  const filteredTickets = tickets.filter((t) => {
    // 1. Status Filter Tab
    if (statusFilter === 'open' && !isOpenState(t.state)) return false;
    if (statusFilter === 'closed' && !isClosedState(t.state)) return false;

    // 2. Search Query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.identifier.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      (t.pageUrl && t.pageUrl.toLowerCase().includes(q)) ||
      (t.teamName && t.teamName.toLowerCase().includes(q)) ||
      (t.state?.name && t.state.name.toLowerCase().includes(q))
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {linearClient && tickets.length > 0 && (
              <button
                type="button"
                className="btn-micro"
                onClick={() => syncStatuses(true)}
                disabled={isSyncing}
                title="Sync current status from Linear (closed tickets are ignored)"
              >
                <RefreshCw size={11} className={isSyncing ? 'spin' : ''} />
                <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
              </button>
            )}
            {tickets.length > 0 && (
              <button
                type="button"
                className="btn-micro"
                style={{ color: 'var(--accent-red)' }}
                onClick={handleClearAll}
                title="Clear all ticket history"
              >
                <Trash2 size={11} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status Filter Tabs (Open is default view) */}
      {tickets.length > 0 && (
        <div className="history-filter-tabs">
          <button
            type="button"
            className={`history-tab-btn ${statusFilter === 'open' ? 'active' : ''}`}
            onClick={() => setStatusFilter('open')}
          >
            <span className="dot-status dot-open" />
            <span>Open</span>
            <span className="history-tab-count">{openCount}</span>
          </button>
          <button
            type="button"
            className={`history-tab-btn ${statusFilter === 'closed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('closed')}
          >
            <span className="dot-status dot-closed" />
            <span>Closed</span>
            <span className="history-tab-count">{closedCount}</span>
          </button>
          <button
            type="button"
            className={`history-tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <span>All</span>
            <span className="history-tab-count">{allCount}</span>
          </button>
        </div>
      )}

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
            placeholder="Search tickets by ID, title, status, or URL..."
          />
        </div>
      )}

      {/* Tickets List */}
      <div className="history-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredTickets.length === 0 ? (
          <div className="empty-state" style={{ padding: '36px 16px', textAlign: 'center' }}>
            <Clock size={28} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>
              {searchQuery
                ? 'No matching tickets'
                : statusFilter === 'open'
                ? 'No open tickets'
                : statusFilter === 'closed'
                ? 'No closed tickets'
                : 'No tickets created yet'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {searchQuery
                ? 'Try a different search query'
                : statusFilter === 'open'
                ? 'All your created tickets are closed or resolved.'
                : statusFilter === 'closed'
                ? 'Closed or completed tickets will appear here once resolved.'
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
              {/* Header row: ID chip, Status Badge, Type, Time, Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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

                  {/* Current Status Badge */}
                  {ticket.state ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '10.5px',
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        backgroundColor: `${ticket.state.color || '#5E6AD2'}1F`,
                        color: ticket.state.color || '#8B97FF',
                        border: `1px solid ${ticket.state.color || '#5E6AD2'}44`,
                      }}
                      title={`Status: ${ticket.state.name}`}
                    >
                      <span style={{ fontSize: '11px' }}>
                        {getStateIcon(ticket.state.type, ticket.state.name)}
                      </span>
                      <span>{ticket.state.name}</span>
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--text-muted)',
                      }}
                      title="Status pending sync"
                    >
                      <span>⚪</span>
                      <span>Pending</span>
                    </span>
                  )}

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

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
