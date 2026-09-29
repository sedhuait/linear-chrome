import React, { useState } from 'react';
import { Plus, Trash2, Download, Upload, Globe, Tag, Edit2 } from 'lucide-react';
import { MappingRule, MatchType, PageMetadata } from '../types/mapping';
import { LinearWorkspaceData } from '../types/linear';
import { StorageService } from '../services/storage';
import { normalizeDomainInput } from '../utils/domain';

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
  const [defaultLabels, setDefaultLabels] = useState<string[]>(['Engineering']);
  const [allowedLabels, setAllowedLabels] = useState<string[]>([]);
  const [customDefaultInput, setCustomDefaultInput] = useState('');
  const [customAllowedInput, setCustomAllowedInput] = useState('');

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

      const defs = rule.labels ? [...rule.labels] : [];
      if (defs.length === 0 && rule.labelName) {
        defs.push(rule.labelName);
      }
      if (!defs.some((l) => l.toLowerCase() === 'engineering')) {
        defs.unshift('Engineering');
      }
      setDefaultLabels(defs);
      setAllowedLabels(rule.allowedLabels ? [...rule.allowedLabels] : []);
      setCustomDefaultInput('');
      setCustomAllowedInput('');
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

      const defs = initial?.labels ? [...initial.labels] : [];
      if (initial?.labelName && !defs.includes(initial.labelName)) {
        defs.push(initial.labelName);
      }
      if (!defs.some((l) => l.toLowerCase() === 'engineering')) {
        defs.unshift('Engineering');
      }
      setDefaultLabels(defs);
      setAllowedLabels(initial?.allowedLabels ? [...initial.allowedLabels] : []);
      setCustomDefaultInput('');
      setCustomAllowedInput('');
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

  const selectedTeam = workspace?.teams?.find((t) => t.id === teamId);
  const availableProjects = (selectedTeam?.projects || workspace?.projects || []);

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

    const primaryLabel = defaultLabels[0] || undefined;
    const matchedLabel = primaryLabel
      ? availableLabels.find((l) => l.name.toLowerCase() === primaryLabel.toLowerCase())
      : undefined;
    const resolvedLabelId = matchedLabel?.id || undefined;

    const ruleData = {
      name: ruleName.trim(),
      matchType,
      pattern: pattern.trim(),
      metaKey: matchType === 'meta_tag' ? metaKey.trim() : undefined,
      metaValue: matchType === 'meta_tag' ? metaValue.trim() : undefined,
      teamId,
      projectId: projectId || undefined,
      labelId: resolvedLabelId,
      labelName: primaryLabel,
      labels: defaultLabels,
      allowedLabels: allowedLabels.length > 0 ? allowedLabels : undefined,
    };

    if (editingRuleId) {
      await StorageService.updateMappingRule(editingRuleId, ruleData);
      showToast(`Updated mapping "${ruleName.trim()}"`);
    } else {
      await StorageService.addMappingRule(ruleData);
      showToast(`Created mapping "${ruleName.trim()}"`);
    }

    // Automatically whitelist any domain defined in the mapping rule
    const domainFromPattern = normalizeDomainInput(pattern);
    if (domainFromPattern && domainFromPattern.includes('.')) {
      const updatedWhitelisted = await StorageService.addWhitelistedDomain(domainFromPattern);
      try {
        await chrome.runtime.sendMessage({ type: 'SYNC_WHITELIST', domains: updatedWhitelisted });
      } catch {
        // ignore
      }
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
        for (const r of updated) {
          if (r.pattern) {
            const clean = normalizeDomainInput(r.pattern);
            if (clean && clean.includes('.')) {
              await StorageService.addWhitelistedDomain(clean);
            }
          }
        }
        const settings = await StorageService.getSettings();
        try {
          await chrome.runtime.sendMessage({ type: 'SYNC_WHITELIST', domains: settings.whitelistedDomains });
        } catch {
          // ignore
        }
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

                    {/* Column 3: Mapped & Allowed Labels */}
                    <div style={{ overflow: 'hidden', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {rule.labels && rule.labels.length > 0 ? (
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
                          title={`Default labels: ${rule.labels.join(', ')}`}
                        >
                          🏷️ {rule.labels.join(', ')}
                        </span>
                      ) : rule.labelName ? (
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
                          title={`Default label: ${rule.labelName}`}
                        >
                          🏷️ {rule.labelName}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          (No default label)
                        </span>
                      )}

                      {rule.allowedLabels && rule.allowedLabels.length > 0 && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'rgba(38, 181, 206, 0.15)',
                            color: '#26B5CE',
                            border: '1px solid rgba(38, 181, 206, 0.3)',
                            fontSize: '9.5px',
                            fontWeight: 500,
                            maxWidth: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`Allowed project labels: ${rule.allowedLabels.join(', ')}`}
                        >
                          📋 {rule.allowedLabels.length} project labels
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

              {/* Section 1: Default Auto-Applied Labels */}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <div className="label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>
                    Default Labels (Auto-applied to tickets)
                  </label>
                  {defaultLabels.length > 0 && (
                    <button
                      type="button"
                      className="btn-micro"
                      onClick={() => setDefaultLabels([])}
                      style={{ fontSize: '10px', padding: '1px 5px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  These labels will always be automatically tagged when creating a ticket for this mapping.
                </div>

                {/* Selected Default Chips */}
                <div
                  style={{
                    minHeight: 34,
                    padding: '4px 8px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 5,
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  {defaultLabels.length === 0 ? (
                    <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>No default labels (click below or type to add)</span>
                  ) : (
                    defaultLabels.map((name) => {
                      const matching = availableLabels.find((l) => l.name.toLowerCase() === name.toLowerCase());
                      const color = matching?.color || '#5E6AD2';
                      return (
                        <span
                          key={name}
                          style={{
                            fontSize: '11px',
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: `${color}18`,
                            border: `1px solid ${color}44`,
                            color: 'var(--text-main)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                          <span>{name}</span>
                          <span
                            role="button"
                            style={{ cursor: 'pointer', opacity: 0.6, fontSize: '13px', lineHeight: 1 }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                            onClick={() => setDefaultLabels((prev) => prev.filter((item) => item !== name))}
                            title="Remove default label"
                          >
                            ×
                          </span>
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Quick Add Custom Default Label */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    value={customDefaultInput}
                    onChange={(e) => setCustomDefaultInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customDefaultInput.trim()) {
                        e.preventDefault();
                        const val = customDefaultInput.trim();
                        if (!defaultLabels.some((l) => l.toLowerCase() === val.toLowerCase())) {
                          setDefaultLabels((prev) => [...prev, val]);
                        }
                        setCustomDefaultInput('');
                      }
                    }}
                    placeholder="Type custom label (e.g. repo:app) and press Enter..."
                    style={{ height: 28, fontSize: '11.5px', flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ height: 28, padding: '0 10px', fontSize: '11px' }}
                    onClick={() => {
                      const val = customDefaultInput.trim();
                      if (val && !defaultLabels.some((l) => l.toLowerCase() === val.toLowerCase())) {
                        setDefaultLabels((prev) => [...prev, val]);
                      }
                      setCustomDefaultInput('');
                    }}
                  >
                    + Add
                  </button>
                </div>

                {/* Team Labels Quick Toggles for Default */}
                {availableLabels.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      Click to toggle default labels:
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxHeight: 65, overflowY: 'auto' }}>
                      {availableLabels.map((l) => {
                        const isSelected = defaultLabels.some((d) => d.toLowerCase() === l.name.toLowerCase());
                        return (
                          <button
                            key={l.id}
                            type="button"
                            className="btn-micro"
                            style={{
                              fontSize: '10px',
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: isSelected ? `${l.color || '#5E6AD2'}25` : 'rgba(255, 255, 255, 0.04)',
                              color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                              border: isSelected ? `1px solid ${l.color || '#5E6AD2'}` : '1px solid var(--border-color)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={() => {
                              if (isSelected) {
                                setDefaultLabels((prev) => prev.filter((d) => d.toLowerCase() !== l.name.toLowerCase()));
                              } else {
                                setDefaultLabels((prev) => [...prev, l.name]);
                              }
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: l.color || '#5E6AD2' }} />
                            <span>{l.name}</span>
                            {isSelected ? <span>✓</span> : <span style={{ opacity: 0.4 }}>+</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Allowed Project Labels (Dropdown Selection Filter) */}
              <div className="form-group" style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px dashed var(--border-color)' }}>
                <div className="label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Allowed Project Labels (Selection Filter)</span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: allowedLabels.length > 0 ? 'rgba(38, 181, 206, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                        color: allowedLabels.length > 0 ? '#26B5CE' : 'var(--text-tertiary)',
                        fontWeight: 600,
                      }}
                    >
                      {allowedLabels.length > 0 ? `${allowedLabels.length} allowed` : 'All team labels'}
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {availableLabels.length > 0 && (
                      <button
                        type="button"
                        className="btn-micro"
                        onClick={() => setAllowedLabels(availableLabels.map((l) => l.name))}
                        style={{ fontSize: '9.5px', padding: '1px 5px' }}
                      >
                        Select All
                      </button>
                    )}
                    {allowedLabels.length > 0 && (
                      <button
                        type="button"
                        className="btn-micro"
                        onClick={() => setAllowedLabels([])}
                        style={{ fontSize: '9.5px', padding: '1px 5px' }}
                      >
                        Reset to All
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                  Only these selected labels will appear in the issue creation dropdown when working on this project. If none are selected, all team labels will be available.
                </div>

                {/* Quick add custom allowed label */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    value={customAllowedInput}
                    onChange={(e) => setCustomAllowedInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customAllowedInput.trim()) {
                        e.preventDefault();
                        const val = customAllowedInput.trim();
                        if (!allowedLabels.some((l) => l.toLowerCase() === val.toLowerCase())) {
                          setAllowedLabels((prev) => [...prev, val]);
                        }
                        setCustomAllowedInput('');
                      }
                    }}
                    placeholder="Type custom allowed label and press Enter..."
                    style={{ height: 28, fontSize: '11.5px', flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ height: 28, padding: '0 10px', fontSize: '11px' }}
                    onClick={() => {
                      const val = customAllowedInput.trim();
                      if (val && !allowedLabels.some((l) => l.toLowerCase() === val.toLowerCase())) {
                        setAllowedLabels((prev) => [...prev, val]);
                      }
                      setCustomAllowedInput('');
                    }}
                  >
                    + Add
                  </button>
                </div>

                {/* Team Labels Filter Grid */}
                {availableLabels.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxHeight: 90, overflowY: 'auto', padding: '6px', background: 'rgba(0, 0, 0, 0.15)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                    {availableLabels.map((l) => {
                      const isAllowed = allowedLabels.some((a) => a.toLowerCase() === l.name.toLowerCase());
                      return (
                        <button
                          key={l.id}
                          type="button"
                          className="btn-micro"
                          style={{
                            fontSize: '10px',
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: isAllowed ? `${l.color || '#26B5CE'}25` : 'rgba(255, 255, 255, 0.03)',
                            color: isAllowed ? '#ffffff' : 'var(--text-muted)',
                            border: isAllowed ? `1px solid ${l.color || '#26B5CE'}` : '1px solid rgba(255, 255, 255, 0.08)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontWeight: isAllowed ? 600 : 400,
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => {
                            if (isAllowed) {
                              setAllowedLabels((prev) => prev.filter((a) => a.toLowerCase() !== l.name.toLowerCase()));
                            } else {
                              setAllowedLabels((prev) => [...prev, l.name]);
                            }
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: l.color || '#5E6AD2' }} />
                          <span>{l.name}</span>
                          {isAllowed ? <span style={{ color: '#26B5CE' }}>✓</span> : <span style={{ opacity: 0.3 }}>+</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
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
