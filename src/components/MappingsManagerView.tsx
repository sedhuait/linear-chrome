import React, { useState } from 'react';
import { Plus, Trash2, Download, Upload, Globe, Tag, Edit2 } from 'lucide-react';
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
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('domain');
  const [pattern, setPattern] = useState('');
  const [metaKey, setMetaKey] = useState('');
  const [metaValue, setMetaValue] = useState('');
  const [teamId, setTeamId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [labelId, setLabelId] = useState('');
  const [labelNameInput, setLabelNameInput] = useState('');

  const openRuleModal = (rule?: MappingRule, initial?: Partial<MappingRule>) => {
    if (rule) {
      setEditingRuleId(rule.id);
      setRuleName(rule.name);
      setMatchType(rule.matchType);
      setPattern(rule.pattern);
      setMetaKey(rule.metaKey || '');
      setMetaValue(rule.metaValue || '');
      setTeamId(rule.teamId);
      setProjectId(rule.projectId || '');
      setLabelId(rule.labelId || '');
      setLabelNameInput(rule.labelName || '');
    } else {
      setEditingRuleId(null);
      setRuleName(initial?.name || '');
      setMatchType(initial?.matchType || 'domain');
      setPattern(initial?.pattern || '');
      setMetaKey(initial?.metaKey || '');
      setMetaValue(initial?.metaValue || '');
      const tId = initial?.teamId || (workspace?.teams[0]?.id || '');
      setTeamId(tId);
      setProjectId(initial?.projectId || '');
      setLabelId(initial?.labelId || '');
      setLabelNameInput(initial?.labelName || '');
    }
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
      openRuleModal(undefined, {
        name: `${pageMetadata.hostname} (${foundVal})`,
        matchType: 'meta_tag',
        metaKey: foundKey,
        metaValue: foundVal,
        pattern: foundVal,
      });
    } else {
      openRuleModal(undefined, {
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
      showToast('Project/Rule Name and Team are required.');
      return;
    }

    const trimmedLabelName = labelNameInput.trim();
    const matchedLabel = availableLabels.find(
      (l) => l.id === labelId || l.name.toLowerCase() === trimmedLabelName.toLowerCase()
    );

    const resolvedLabelId = matchedLabel?.id || (labelId ? labelId : undefined);
    const resolvedLabelName = trimmedLabelName || matchedLabel?.name || undefined;

    const ruleData = {
      name: ruleName.trim(),
      matchType,
      pattern: pattern.trim(),
      metaKey: matchType === 'meta_tag' ? metaKey.trim() : undefined,
      metaValue: matchType === 'meta_tag' ? metaValue.trim() : undefined,
      teamId,
      projectId: projectId || undefined,
      labelId: resolvedLabelId,
      labelName: resolvedLabelName,
    };

    if (editingRuleId) {
      await StorageService.updateMappingRule(editingRuleId, ruleData);
      showToast(`Updated mapping "${ruleName.trim()}"`);
    } else {
      await StorageService.addMappingRule(ruleData);
      showToast(`Created mapping "${ruleName.trim()}"`);
    }

    const updated = await StorageService.getMappingRules();
    onRulesUpdated(updated);
    setIsModalOpen(false);
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
        <h3 className="pane-title">Project & Label Mappings</h3>
        <p className="pane-subtitle">
          Map web domains, URLs, or services directly to Linear Teams, Projects, and Labels (e.g. <code>repo:api</code>, <code>repo:app</code>).
        </p>
      </div>

      {/* Active Tab Inspection Box */}
      {pageMetadata && (
        <div className="current-page-card" style={{ marginBottom: 14 }}>
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
            style={{ marginTop: 6 }}
          >
            <Plus size={13} />
            <span>+ Add Mapping for this Site</span>
          </button>
        </div>
      )}

      {/* Project Mappings Table Section */}
      <div className="rules-section">
        <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h4 className="section-title" style={{ margin: 0 }}>Project Mappings ({rules.length})</h4>
          </div>
          <button
            type="button"
            className="btn-micro-accent"
            onClick={() => openRuleModal()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={12} />
            <span>+ Add Mapping</span>
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="empty-state">
            No project mappings configured yet. Click <strong>+ Add Mapping</strong> above to link a service (e.g. <code>easydp-api</code>) to a Linear Team & Label!
          </div>
        ) : (
          <div
            className="mapping-table-container"
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              background: 'var(--bg-secondary)',
              marginBottom: 14,
            }}
          >
            {/* Table Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1.1fr 1fr 52px',
                padding: '8px 10px',
                background: 'rgba(255, 255, 255, 0.04)',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <span>Service / Pattern</span>
              <span>Linear Team</span>
              <span>Mapped Label</span>
              <span style={{ textAlign: 'right' }}>Action</span>
            </div>

            {/* Table Body */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rules.map((rule, idx) => {
                const team = workspace?.teams.find((t) => t.id === rule.teamId);
                const proj = workspace?.projects.find((p) => p.id === rule.projectId);
                const isEven = idx % 2 === 0;

                return (
                  <div
                    key={rule.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 1.1fr 1fr 52px',
                      padding: '8px 10px',
                      alignItems: 'center',
                      background: isEven ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                      borderBottom: idx < rules.length - 1 ? '1px solid var(--border-color)' : 'none',
                      fontSize: '11px',
                    }}
                  >
                    {/* Column 1: Service / Pattern */}
                    <div style={{ overflow: 'hidden', paddingRight: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {rule.matchType === 'meta_tag' ? <Tag size={12} color="#F2994A" /> : <Globe size={12} color="#5E6AD2" />}
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rule.name}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: 1,
                        }}
                        title={rule.pattern}
                      >
                        {rule.matchType === 'meta_tag' ? `<meta ${rule.metaKey}="${rule.metaValue}">` : rule.pattern}
                      </div>
                    </div>

                    {/* Column 2: Linear Team & Project */}
                    <div style={{ overflow: 'hidden', paddingRight: 6 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {team?.name || rule.teamId}
                      </div>
                      {proj && (
                        <div style={{ fontSize: '10px', color: '#8B97FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          › {proj.name}
                        </div>
                      )}
                    </div>

                    {/* Column 3: Mapped Label */}
                    <div style={{ overflow: 'hidden', paddingRight: 4 }}>
                      {rule.labelName ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(94, 106, 210, 0.2)',
                            color: '#8B97FF',
                            border: '1px solid rgba(94, 106, 210, 0.4)',
                            fontSize: '10px',
                            fontWeight: 600,
                            maxWidth: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`Label applied: ${rule.labelName}`}
                        >
                          🏷️ {rule.labelName}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          (None)
                        </span>
                      )}
                    </div>

                    {/* Column 4: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => openRuleModal(rule)}
                        title="Edit Rule"
                        style={{ padding: 3, opacity: 0.8, cursor: 'pointer' }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon-danger"
                        onClick={() => handleDeleteRule(rule.id)}
                        title="Delete Rule"
                        style={{ padding: 3, cursor: 'pointer' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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

      {/* Add / Edit Mapping Modal */}
      {isModalOpen && (
        <div className="modal">
          <div className="modal-content">
            <h4 className="modal-title">{editingRuleId ? 'Edit Project Mapping' : 'New Project Mapping'}</h4>
            <form onSubmit={handleSaveRule}>
              <div className="form-group">
                <label className="form-label">
                  Service / Project Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. easydp-api or easydp-app"
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
                  <option value="domain">Domain / Hostname (e.g. api.easydp.com)</option>
                  <option value="url_prefix">URL Prefix (e.g. https://easydp.com/api)</option>
                  <option value="url_regex">URL Regular Expression</option>
                  <option value="title_contains">Page Title Contains (e.g. EasyDP API)</option>
                  <option value="meta_tag">HTML &lt;meta&gt; Tag (e.g. project="easydp-api")</option>
                </select>
              </div>

              {matchType !== 'meta_tag' ? (
                <div className="form-group">
                  <label className="form-label">Pattern <span className="required">*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder="e.g. easydp-api.internal or api.easydp.com"
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
                      placeholder="e.g. application-name or project"
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
                      placeholder="e.g. easydp-api"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group col">
                  <label className="form-label">
                    Assign Team <span className="required">*</span>
                  </label>
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
                  <label className="form-label">Assign Project (Optional)</label>
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

              {/* Mapped Label Field */}
              <div className="form-group">
                <div className="label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Mapped Label (e.g. <code>repo:api</code> or <code>repo:app</code>)
                  </label>
                  {labelNameInput && (
                    <button
                      type="button"
                      className="btn-micro"
                      onClick={() => {
                        setLabelNameInput('');
                        setLabelId('');
                      }}
                      style={{ fontSize: '10px', padding: '1px 5px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="form-input"
                  value={labelNameInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLabelNameInput(val);
                    const found = availableLabels.find(l => l.name.toLowerCase() === val.trim().toLowerCase());
                    setLabelId(found ? found.id : '');
                  }}
                  placeholder="e.g. repo:api or repo:app"
                />

                {/* Quick picker from existing Linear labels */}
                {availableLabels.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      Or choose from existing team labels:
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxHeight: 60, overflowY: 'auto' }}>
                      {availableLabels.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          className="btn-micro"
                          style={{
                            fontSize: '9.5px',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: labelNameInput.toLowerCase() === l.name.toLowerCase()
                              ? 'rgba(94, 106, 210, 0.3)'
                              : 'rgba(255, 255, 255, 0.05)',
                            color: labelNameInput.toLowerCase() === l.name.toLowerCase() ? '#8B97FF' : 'var(--text-secondary)',
                            border: labelNameInput.toLowerCase() === l.name.toLowerCase() ? '1px solid #5E6AD2' : '1px solid var(--border-color)',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            setLabelNameInput(l.name);
                            setLabelId(l.id);
                          }}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  ℹ️ This label will be automatically tagged on tickets created for this service (and auto-created in Linear if it doesn't exist).
                </div>
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
                  {editingRuleId ? 'Update Mapping' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
