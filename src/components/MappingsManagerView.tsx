import React, { useState } from 'react';
import { Plus, Trash2, Download, Upload, Globe, Tag } from 'lucide-react';
import { MappingRule, MatchType, PageMetadata } from '../types/mapping';
import { LinearWorkspaceData } from '../types/linear';
import { StorageService } from '../services/storage';

interface MappingsManagerViewProps {
  pageMetadata: PageMetadata | null;
  workspace: LinearWorkspaceData | null;
  rules: MappingRule[];
  onRulesUpdated: (rules: MappingRule[]) => void;
  showToast: (msg: string) => void;
}

export const MappingsManagerView: React.FC<MappingsManagerViewProps> = ({
  pageMetadata,
  workspace,
  rules,
  onRulesUpdated,
  showToast,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('domain');
  const [pattern, setPattern] = useState('');
  const [metaKey, setMetaKey] = useState('');
  const [metaValue, setMetaValue] = useState('');
  const [teamId, setTeamId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [labelId, setLabelId] = useState('');

  const openNewRuleModal = (initial?: Partial<MappingRule>) => {
    setRuleName(initial?.name || '');
    setMatchType(initial?.matchType || 'domain');
    setPattern(initial?.pattern || '');
    setMetaKey(initial?.metaKey || '');
    setMetaValue(initial?.metaValue || '');
    const tId = initial?.teamId || (workspace?.teams[0]?.id || '');
    setTeamId(tId);
    setProjectId(initial?.projectId || '');
    setLabelId(initial?.labelId || '');
    setIsModalOpen(true);
  };

  const handleQuickAddForCurrent = () => {
    if (!pageMetadata) return;

    // Check meta tags first
    const candidateKeys = ['application-name', 'project', 'og:site_name', 'apple-mobile-web-app-title'];
    let foundKey = '';
    let foundVal = '';

    for (const k of candidateKeys) {
      if (pageMetadata.metaTags[k]) {
        foundKey = k;
        foundVal = pageMetadata.metaTags[k];
        break;
      }
    }

    if (foundKey) {
      openNewRuleModal({
        name: `${pageMetadata.hostname} (${foundVal})`,
        matchType: 'meta_tag',
        metaKey: foundKey,
        metaValue: foundVal,
        pattern: foundVal,
      });
    } else {
      openNewRuleModal({
        name: pageMetadata.hostname,
        matchType: 'domain',
        pattern: pageMetadata.hostname,
      });
    }
  };

  const selectedTeam = workspace?.teams.find((t) => t.id === teamId);
  const availableProjects = selectedTeam ? selectedTeam.projects : workspace?.projects || [];

  // Deduplicated labels for selected team and workspace
  const availableLabelsMap = new Map<string, { id: string; name: string; color: string }>();
  if (workspace?.labels) {
    for (const l of workspace.labels) availableLabelsMap.set(l.id, l);
  }
  if (selectedTeam?.labels) {
    for (const l of selectedTeam.labels) availableLabelsMap.set(l.id, l);
  }
  const availableLabels = Array.from(availableLabelsMap.values());

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !teamId) {
      showToast('Rule Name and Team are required.');
      return;
    }

    const matchedLabel = availableLabels.find((l) => l.id === labelId);

    await StorageService.addMappingRule({
      name: ruleName.trim(),
      matchType,
      pattern: pattern.trim(),
      metaKey: matchType === 'meta_tag' ? metaKey.trim() : undefined,
      metaValue: matchType === 'meta_tag' ? metaValue.trim() : undefined,
      teamId,
      projectId: projectId || undefined,
      labelId: labelId || undefined,
      labelName: matchedLabel?.name || undefined,
    });

    const updated = await StorageService.getMappingRules();
    onRulesUpdated(updated);
    setIsModalOpen(false);
    showToast('Mapping rule saved!');
  };

  const handleDeleteRule = async (id: string) => {
    await StorageService.deleteMappingRule(id);
    const updated = await StorageService.getMappingRules();
    onRulesUpdated(updated);
    showToast('Rule deleted.');
  };

  const handleExport = async () => {
    const json = await StorageService.exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linear-rules-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported mapping rules.');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        const res = await StorageService.importData(text);
        const updated = await StorageService.getMappingRules();
        onRulesUpdated(updated);
        showToast(`Imported ${res.ruleCount} rules successfully!`);
      } catch (err) {
        showToast('Import error: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="mappings-view">
      <div className="pane-header">
        <h3 className="pane-title">URL & Meta Project Mappings</h3>
        <p className="pane-subtitle">
          Map web domains, URL regex patterns, or HTML &lt;meta&gt; tags directly to Linear teams and projects.
        </p>
      </div>

      {/* Active Tab Inspection Box */}
      {pageMetadata && (
        <div className="current-page-card">
          <div className="card-header">
            <span className="card-tag">Active Tab</span>
            <span className="card-hostname">{pageMetadata.hostname}</span>
          </div>

          <div className="current-meta-details">
            <div className="meta-row">
              <span className="meta-key">URL:</span>
              <span className="meta-val">{pageMetadata.url}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Title:</span>
              <span className="meta-val">{pageMetadata.title}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Meta:</span>
              <span className="meta-val">
                {Object.keys(pageMetadata.metaTags).length > 0
                  ? Object.entries(pageMetadata.metaTags)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}="${v}"`)
                      .join(', ')
                  : 'No semantic meta tags detected'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleQuickAddForCurrent}
            style={{ marginTop: 4 }}
          >
            <Plus size={14} />
            <span>+ Add Rule for this Site</span>
          </button>
        </div>
      )}

      {/* Saved Rules Section */}
      <div className="rules-section">
        <div className="section-title-row">
          <h4 className="section-title">Saved Rules ({rules.length})</h4>
          <button
            type="button"
            className="btn-micro-accent"
            onClick={() => openNewRuleModal()}
          >
            <Plus size={12} />
            <span>New Rule</span>
          </button>
        </div>

        <div className="rules-list">
          {rules.length === 0 ? (
            <div className="empty-state">No custom mapping rules yet. Add one above!</div>
          ) : (
            rules.map((rule) => {
              const team = workspace?.teams.find((t) => t.id === rule.teamId);
              const proj = workspace?.projects.find((p) => p.id === rule.projectId);
              const target = proj ? `${team?.name || rule.teamId} › ${proj.name}` : team?.name || rule.teamId;

              return (
                <div key={rule.id} className="rule-item">
                  <div className="rule-item-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {rule.matchType === 'meta_tag' ? <Tag size={13} color="#F2994A" /> : <Globe size={13} color="#5E6AD2" />}
                      <span className="rule-item-name">{rule.name}</span>
                    </div>
                    <span className="rule-item-desc">
                      {rule.matchType === 'meta_tag'
                        ? `<meta ${rule.metaKey}="${rule.metaValue}">`
                        : `${rule.matchType}: ${rule.pattern}`}{' '}
                      → <strong>{target}</strong>
                      {rule.labelName && (
                        <span
                          style={{
                            marginLeft: 6,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(94, 106, 210, 0.12)',
                            color: '#5E6AD2',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          🏷️ {rule.labelName}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="rule-item-actions">
                    <button
                      type="button"
                      className="btn-icon-danger"
                      onClick={() => handleDeleteRule(rule.id)}
                      title="Delete Rule"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Backup and Share bar */}
      <div className="mapping-backup-bar">
        <button type="button" className="btn-micro" onClick={handleExport}>
          <Download size={12} />
          <span>Export JSON</span>
        </button>
        <label className="btn-micro" style={{ cursor: 'pointer' }}>
          <Upload size={12} />
          <span>Import JSON</span>
          <input
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </label>
      </div>

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="modal">
          <div className="modal-content">
            <h4 className="modal-title">Mapping Rule</h4>
            <form onSubmit={handleSaveRule}>
              <div className="form-group">
                <label className="form-label">Rule Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Internal Portal"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Match Strategy</label>
                <select
                  className="form-select"
                  value={matchType}
                  onChange={(e) => setMatchType(e.target.value as MatchType)}
                >
                  <option value="domain">Domain / Hostname (e.g. app.site.com)</option>
                  <option value="url_prefix">URL Prefix (e.g. https://site.com/admin)</option>
                  <option value="url_regex">URL Regular Expression</option>
                  <option value="title_contains">Page Title Contains</option>
                  <option value="meta_tag">HTML &lt;meta&gt; Tag</option>
                </select>
              </div>

              {matchType !== 'meta_tag' ? (
                <div className="form-group">
                  <label className="form-label">Pattern</label>
                  <input
                    type="text"
                    className="form-input"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder="e.g. internal.domain.com"
                    required
                  />
                </div>
              ) : (
                <div className="form-row">
                  <div className="form-group col">
                    <label className="form-label">Meta Key</label>
                    <input
                      type="text"
                      className="form-input"
                      value={metaKey}
                      onChange={(e) => setMetaKey(e.target.value)}
                      placeholder="e.g. application-name"
                      required
                    />
                  </div>
                  <div className="form-group col">
                    <label className="form-label">Expected Value</label>
                    <input
                      type="text"
                      className="form-input"
                      value={metaValue}
                      onChange={(e) => setMetaValue(e.target.value)}
                      placeholder="e.g. Core App"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group col">
                  <label className="form-label">Assign Team</label>
                  <select
                    className="form-select"
                    value={teamId}
                    onChange={(e) => {
                      setTeamId(e.target.value);
                      setProjectId('');
                    }}
                    required
                  >
                    <option value="">Select Team...</option>
                    {workspace?.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group col">
                  <label className="form-label">Assign Project</label>
                  <select
                    className="form-select"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">(No Project)</option>
                    {availableProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Default Label (e.g. Engineering)</label>
                <select
                  className="form-select"
                  value={labelId}
                  onChange={(e) => setLabelId(e.target.value)}
                >
                  <option value="">(No Label)</option>
                  {availableLabels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
