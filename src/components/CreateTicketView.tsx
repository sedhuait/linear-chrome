import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bug,
  Lightbulb,
  CheckSquare,
  RefreshCw,
  Edit3,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  Link2,
} from 'lucide-react';
import { CreatedIssue, LinearWorkspaceData } from '../types/linear';
import { MappingRule, PageMetadata, TicketType } from '../types/mapping';
import { LinearApiClient } from '../services/linear-api';
import { StorageService, ExtensionSettings } from '../services/storage';
import { InlineAnnotator } from './InlineAnnotator';

// Helper to convert data URL to Blob cleanly
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

interface CreateTicketViewProps {
  linearClient: LinearApiClient | null;
  workspace: LinearWorkspaceData | null;
  pageMetadata: PageMetadata | null;
  settings: ExtensionSettings;
  matchedRule: MappingRule | null;
  matchReason?: string;
  onOpenSettings: () => void;
  onSaveAsRule: () => void;
  onViewHistory?: () => void;
  showToast: (msg: string) => void;
}

export const CreateTicketView: React.FC<CreateTicketViewProps> = ({
  linearClient,
  workspace,
  pageMetadata,
  settings,
  matchedRule,
  matchReason,
  onOpenSettings,
  onSaveAsRule,
  onViewHistory,
  showToast,
}) => {
  const [ticketType, setTicketType] = useState<TicketType>(
    matchedRule?.defaultType || settings.defaultTicketType || 'Bug'
  );
  const [teamId, setTeamId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [currentUrl, setCurrentUrl] = useState<string>(pageMetadata?.url || '');
  const [priority, setPriority] = useState<number>(matchedRule?.defaultPriority ?? 3);
  const [labelId, setLabelId] = useState<string>('');
  const [isEngineering, setIsEngineering] = useState<boolean>(true);
  const [isChromeExtLabel, setIsChromeExtLabel] = useState<boolean>(true);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [includeScreenshot, setIncludeScreenshot] = useState<boolean>(
    settings.includeScreenshotByDefault
  );
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isAnnotated, setIsAnnotated] = useState<boolean>(false);
  const [isAnnotating, setIsAnnotating] = useState<boolean>(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdIssue, setCreatedIssue] = useState<CreatedIssue | null>(null);
  const draftLoadedRef = useRef<boolean>(false);

  // Template generator
  const getTemplateForType = useCallback((type: TicketType): string => {
    if (type === 'Bug') {
      return `### Steps to Reproduce\n1. \n\n### Observed Behavior\n\n### Expected Behavior\n`;
    }
    if (type === 'Improvement') {
      return `### Current Experience\n\n### Proposed Improvement\n\n### Expected Impact\n`;
    }
    return `### Objective\n\n### Tasks\n- [ ] `;
  }, []);

  // Initialize form when workspace or matched rule arrives
  useEffect(() => {
    if (!workspace) return;

    let targetTeamId = '';
    let targetProjectId = '';

    if (matchedRule) {
      targetTeamId = matchedRule.teamId;
      targetProjectId = matchedRule.projectId || '';
      if (matchedRule.defaultType) {
        setTicketType(matchedRule.defaultType);
      }
      if (matchedRule.labelId) {
        setLabelId(matchedRule.labelId);
      }
    } else if (workspace.teams.length > 0) {
      targetTeamId = workspace.teams[0].id;
    }

    setTeamId(targetTeamId);
    setProjectId(targetProjectId);
  }, [workspace, matchedRule]);

  // Set default title, URL, and description template
  useEffect(() => {
    if (pageMetadata) {
      if (pageMetadata.url && !currentUrl) {
        setCurrentUrl(pageMetadata.url);
      }
      if (!title) {
        setTitle(`[${ticketType}] ${pageMetadata.title || pageMetadata.hostname}`);
      }
    }
  }, [pageMetadata, ticketType, title, currentUrl]);

  useEffect(() => {
    if (!description) {
      setDescription(getTemplateForType(ticketType));
    }
  }, [ticketType, description, getTemplateForType]);

  // Auto-capture screenshot on load
  const captureScreenshot = useCallback(async () => {
    setIsCapturing(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
      if (response && response.success && response.dataUrl) {
        setScreenshot(response.dataUrl);
        setIsAnnotated(false);
      } else {
        showToast('Screenshot capture not permitted on this browser page');
      }
    } catch {
      showToast('Could not capture screenshot');
    } finally {
      setIsCapturing(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (settings.autoCaptureOnOpen) {
      captureScreenshot();
    }
  }, [settings.autoCaptureOnOpen, captureScreenshot]);

  // Check if annotated image was saved
  useEffect(() => {
    const checkAnnotation = async () => {
      const data = await chrome.storage.local.get(['pending_screenshot', 'pending_screenshot_annotated']);
      if (data.pending_screenshot && data.pending_screenshot_annotated) {
        setScreenshot(data.pending_screenshot);
        setIsAnnotated(true);
        await chrome.storage.local.remove(['pending_screenshot_annotated']);
      }
    };
    checkAnnotation();
  }, []);

  // Update label matching when team or ticket type changes
  useEffect(() => {
    if (!workspace || !teamId) return;
    if (matchedRule?.labelId) return;
    const team = workspace.teams.find((t) => t.id === teamId);
    if (!team) return;

    const target = ticketType.toLowerCase();
    const matchedLabel = team.labels.find((l) => l.name.toLowerCase() === target);
    setLabelId(matchedLabel ? matchedLabel.id : '');
  }, [workspace, teamId, ticketType, matchedRule]);

  // Load saved draft on mount
  useEffect(() => {
    async function loadDraft() {
      try {
        const draft = await StorageService.getDraft();
        if (draft && Date.now() - draft.updatedAt < 24 * 60 * 60 * 1000) {
          if (draft.title) setTitle(draft.title);
          if (draft.description) setDescription(draft.description);
          if (draft.currentUrl) setCurrentUrl(draft.currentUrl);
          if (draft.ticketType) setTicketType(draft.ticketType);
          if (draft.teamId) setTeamId(draft.teamId);
          if (draft.projectId) setProjectId(draft.projectId);
          if (draft.priority !== undefined) setPriority(draft.priority);
          if (draft.labelId) setLabelId(draft.labelId);
          if (draft.isEngineering !== undefined) setIsEngineering(draft.isEngineering);
          if (draft.isChromeExtLabel !== undefined) setIsChromeExtLabel(draft.isChromeExtLabel);
          if (draft.screenshot) {
            setScreenshot(draft.screenshot);
            setIsAnnotated(draft.isAnnotated);
          }
          setHasRestoredDraft(true);
        }
      } catch (e) {
        console.warn('Draft load warning:', e);
      } finally {
        draftLoadedRef.current = true;
      }
    }
    loadDraft();
  }, []);

  // Auto-save draft on form changes
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const timer = setTimeout(() => {
      if (title.trim() || screenshot || (description && description !== getTemplateForType(ticketType))) {
        StorageService.saveDraft({
          ticketType,
          teamId,
          projectId,
          priority,
          labelId,
          isEngineering,
          isChromeExtLabel,
          title,
          description,
          currentUrl,
          screenshot,
          isAnnotated,
          updatedAt: Date.now(),
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ticketType, teamId, projectId, priority, labelId, isEngineering, isChromeExtLabel, title, description, currentUrl, screenshot, isAnnotated, getTemplateForType]);

  const handleClearDraft = async () => {
    await StorageService.clearDraft();
    setHasRestoredDraft(false);
    setTitle(`[${ticketType}] ${pageMetadata?.title || pageMetadata?.hostname || ''}`);
    setDescription(getTemplateForType(ticketType));
    setIsAnnotated(false);
    captureScreenshot();
    showToast('Draft cleared.');
  };

  // Open inline annotator (no tab switching!)
  const handleOpenAnnotator = () => {
    if (!screenshot) {
      showToast('No screenshot to annotate. Capture first.');
      return;
    }
    setIsAnnotating(true);
  };

  const handleSaveAnnotation = (annotatedDataUrl: string) => {
    setScreenshot(annotatedDataUrl);
    setIsAnnotated(true);
    setIsAnnotating(false);
    showToast('✓ Screenshot annotated & attached!');
  };

  // Submit Issue
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linearClient) {
      showToast('Linear API key required. Go to Settings.');
      return;
    }
    if (!teamId || !title.trim()) {
      showToast('Please specify a Team and Title.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalDescription = description.trim();
      let uploadedAssetUrl = '';

      // Prominently prepend captured page URL
      const targetUrl = currentUrl.trim();
      if (targetUrl) {
        finalDescription = `**Page URL:** [${targetUrl}](${targetUrl})\n\n` + finalDescription;
      }

      // 1. Upload screenshot if selected
      if (includeScreenshot && screenshot) {
        try {
          const blob = dataUrlToBlob(screenshot);
          uploadedAssetUrl = await linearClient.uploadScreenshot(
            blob,
            isAnnotated ? 'annotated_screenshot.png' : 'screenshot.png'
          );
          finalDescription += `\n\n---\n### Screenshot\n![Page Screenshot](${uploadedAssetUrl})\n`;
        } catch (uploadErr) {
          console.warn('Linear fileUpload failed, embedding image directly in description markdown:', uploadErr);
          // Seamless fallback: Linear officially supports base64 inline images in Issue descriptions
          finalDescription += `\n\n---\n### Screenshot\n![Page Screenshot](${screenshot})\n`;
        }
      }

      // 2. Append environment & context details
      if (settings.includeEnvInfo && pageMetadata) {
        finalDescription +=
          `\n\n<details><summary><strong>Environment Context</strong></summary>\n\n` +
          `- **URL:** [${targetUrl || pageMetadata.url}](${targetUrl || pageMetadata.url})\n` +
          `- **Page Title:** ${pageMetadata.title}\n` +
          `- **Viewport:** ${pageMetadata.viewport.width} × ${pageMetadata.viewport.height}\n` +
          `- **User Agent:** \`${pageMetadata.userAgent}\`\n` +
          `</details>`;
      }

      // 3. Collect active label IDs (including Engineering & Chrome Extension labels)
      const labelIdsToApply: string[] = [];
      const appliedLabelNames: string[] = [];

      if (labelId) {
        labelIdsToApply.push(labelId);
        const lObj = workspace?.labels.find((l) => l.id === labelId) || selectedTeam?.labels.find((l) => l.id === labelId);
        if (lObj) appliedLabelNames.push(lObj.name);
      }

      if (isEngineering) {
        const engInTeam = selectedTeam?.labels.find((l) => l.name.toLowerCase() === 'engineering');
        const engInWorkspace = workspace?.labels.find((l) => l.name.toLowerCase() === 'engineering');
        let engLabelId = engInTeam?.id || engInWorkspace?.id;

        if (!engLabelId) {
          try {
            const created = await linearClient.getOrCreateLabel('Engineering', teamId, '#5E6AD2');
            if (created) {
              engLabelId = created.id;
            }
          } catch (e) {
            console.warn('Could not auto-create Engineering label:', e);
          }
        }

        if (engLabelId) {
          labelIdsToApply.push(engLabelId);
          appliedLabelNames.push('Engineering');
        }
      }

      if (isChromeExtLabel) {
        const chromeInTeam = selectedTeam?.labels.find(
          (l) => l.name.toLowerCase() === 'chrome extension' || l.name.toLowerCase() === 'chromeextension'
        );
        const chromeInWorkspace = workspace?.labels.find(
          (l) => l.name.toLowerCase() === 'chrome extension' || l.name.toLowerCase() === 'chromeextension'
        );
        let chromeLabelId = chromeInTeam?.id || chromeInWorkspace?.id;

        if (!chromeLabelId) {
          try {
            const created = await linearClient.getOrCreateLabel('Chrome Extension', teamId, '#26B5CE');
            if (created) {
              chromeLabelId = created.id;
            }
          } catch (e) {
            console.warn('Could not auto-create Chrome Extension label:', e);
          }
        }

        if (chromeLabelId) {
          labelIdsToApply.push(chromeLabelId);
          appliedLabelNames.push('Chrome Extension');
        }
      }

      const uniqueLabelIds = Array.from(new Set(labelIdsToApply));

      // 4. Create Linear Issue
      const issue = await linearClient.createIssue({
        teamId,
        title: title.trim(),
        description: finalDescription,
        projectId: projectId || undefined,
        priority,
        labelIds: uniqueLabelIds.length > 0 ? uniqueLabelIds : undefined,
      });

      // 5. Attach screenshot asset if uploaded
      if (uploadedAssetUrl) {
        await linearClient.createAttachment(issue.id, 'Page Screenshot', uploadedAssetUrl);
      }

      // 6. Attach page URL as an official link attachment in Linear
      if (targetUrl) {
        await linearClient.createAttachment(issue.id, 'Reported Page', targetUrl);
      }

      // 7. Save ticket to past tickets history
      const teamObj = workspace?.teams.find((t) => t.id === teamId);
      const projObj = workspace?.projects.find((p) => p.id === projectId);
      await StorageService.savePastTicket({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        createdAt: Date.now(),
        pageUrl: targetUrl || pageMetadata?.url,
        pageTitle: pageMetadata?.title,
        teamName: teamObj?.name,
        projectName: projObj?.name,
        ticketType,
        labels: Array.from(new Set(appliedLabelNames)),
      });

      // 8. Remember preference for domain if enabled
      if (settings.rememberLastSelectedPerDomain && pageMetadata) {
        await StorageService.setDomainPref(pageMetadata.hostname, {
          teamId,
          projectId,
          defaultType: ticketType,
        });
      }

      await StorageService.clearDraft();
      setHasRestoredDraft(false);
      setCreatedIssue(issue);
    } catch (err) {
      showToast('Failed to create ticket: ' + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTeam = workspace?.teams.find((t) => t.id === teamId);
  const availableProjects = selectedTeam ? selectedTeam.projects : workspace?.projects || [];

  if (isAnnotating && screenshot) {
    return (
      <InlineAnnotator
        imageSrc={screenshot}
        onSave={handleSaveAnnotation}
        onCancel={() => setIsAnnotating(false)}
      />
    );
  }

  if (!linearClient) {
    return (
      <div className="api-warning">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />
          <span>Linear API key is not configured.</span>
        </div>
        <button className="btn-link" onClick={onOpenSettings}>
          Configure now →
        </button>
      </div>
    );
  }

  if (createdIssue) {
    return (
      <div className="success-screen">
        <div className="success-icon">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="success-title">Issue Created!</h3>
        <p className="success-identifier">{createdIssue.identifier}</p>
        <p className="success-issue-title">{createdIssue.title}</p>

        <div className="success-actions">
          <a
            href={createdIssue.url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            <span>Open in Linear</span>
            <ExternalLink size={14} />
          </a>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(createdIssue.url);
              showToast('Ticket URL copied to clipboard!');
            }}
          >
            <Copy size={14} />
            <span>Copy Link</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8, alignItems: 'center' }}>
          <button
            className="btn-text-link"
            onClick={() => {
              setCreatedIssue(null);
              setTitle('');
              setDescription(getTemplateForType(ticketType));
              captureScreenshot();
            }}
          >
            Create another ticket
          </button>
          {onViewHistory && (
            <>
              <span style={{ color: 'var(--text-faint)' }}>•</span>
              <button
                className="btn-text-link"
                style={{ color: '#8B97FF' }}
                onClick={onViewHistory}
              >
                View in History
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ticket-view">
      {hasRestoredDraft && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'rgba(94, 106, 210, 0.15)',
          borderBottom: '1px solid rgba(94, 106, 210, 0.3)',
          fontSize: '11px',
          color: '#c4c9f5'
        }}>
          <span>Restored your saved ticket draft</span>
          <button
            type="button"
            className="btn-text-action"
            onClick={handleClearDraft}
            style={{ color: '#eb5757' }}
          >
            Clear Draft
          </button>
        </div>
      )}

      {/* Mapping Status Badge */}
      <div className="mapping-badge-bar">
        <div className="badge-content">
          <span>🎯</span>
          <span>
            {matchedRule
              ? `Auto-mapped: ${selectedTeam?.name || ''} ${
                  projectId ? `› ${availableProjects.find((p) => p.id === projectId)?.name || ''}` : ''
                } (${matchReason})`
              : `Domain: ${pageMetadata?.hostname || 'Unknown'} (No mapping rule)`}
          </span>
        </div>
        {!matchedRule && (
          <button type="button" className="btn-text-action" onClick={onSaveAsRule}>
            Save Rule
          </button>
        )}
      </div>

      <form className="ticket-form" onSubmit={handleSubmit}>
        <div className="ticket-form-body">
          {/* Type Selector Pills */}
          <div className="form-group">
          <label className="form-label">Type</label>
          <div className="type-pill-selector">
            <button
              type="button"
              className={`type-pill ${ticketType === 'Bug' ? 'active' : ''}`}
              onClick={() => {
                setTicketType('Bug');
                if (title.startsWith('[Improvement]') || title.startsWith('[Task]')) {
                  setTitle(title.replace(/^\[(Improvement|Task)\]/, '[Bug]'));
                }
              }}
            >
              <Bug size={14} color="#EB5757" />
              <span>Bug</span>
            </button>
            <button
              type="button"
              className={`type-pill ${ticketType === 'Improvement' ? 'active' : ''}`}
              onClick={() => {
                setTicketType('Improvement');
                if (title.startsWith('[Bug]') || title.startsWith('[Task]')) {
                  setTitle(title.replace(/^\[(Bug|Task)\]/, '[Improvement]'));
                }
              }}
            >
              <Lightbulb size={14} color="#F2994A" />
              <span>Improvement</span>
            </button>
            <button
              type="button"
              className={`type-pill ${ticketType === 'Task' ? 'active' : ''}`}
              onClick={() => {
                setTicketType('Task');
                if (title.startsWith('[Bug]') || title.startsWith('[Improvement]')) {
                  setTitle(title.replace(/^\[(Bug|Improvement)\]/, '[Task]'));
                }
              }}
            >
              <CheckSquare size={14} color="#5E6AD2" />
              <span>Task</span>
            </button>
          </div>
        </div>

        {/* Team & Project Selection */}
        <div className="form-row">
          <div className="form-group col">
            <label className="form-label">
              Team <span className="required">*</span>
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
              {workspace?.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.key})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group col">
            <label className="form-label">Project</label>
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

        {/* Priority & Label Selection */}
        <div className="form-row">
          <div className="form-group col">
            <label className="form-label">Priority</label>
            <select
              className="form-select"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10))}
            >
              <option value="0">No Priority</option>
              <option value="1">Urgent 🔴</option>
              <option value="2">High 🟠</option>
              <option value="3">Medium 🟡</option>
              <option value="4">Low 🔵</option>
            </select>
          </div>

          <div className="form-group col">
            <div className="label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ margin: 0 }}>Labels</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn-micro ${isEngineering ? 'active' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: isEngineering ? '1px solid #5E6AD2' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: isEngineering ? 'rgba(94, 106, 210, 0.2)' : 'transparent',
                    color: isEngineering ? '#8B97FF' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontWeight: isEngineering ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setIsEngineering(!isEngineering)}
                  title="Toggle 'Engineering' label on ticket"
                >
                  <span>Engineering</span>
                  {isEngineering ? <span>✓</span> : <span style={{ opacity: 0.5 }}>+</span>}
                </button>
                <button
                  type="button"
                  className={`btn-micro ${isChromeExtLabel ? 'active' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: isChromeExtLabel ? '1px solid #26B5CE' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: isChromeExtLabel ? 'rgba(38, 181, 206, 0.2)' : 'transparent',
                    color: isChromeExtLabel ? '#26B5CE' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontWeight: isChromeExtLabel ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setIsChromeExtLabel(!isChromeExtLabel)}
                  title="Toggle 'Chrome Extension' label on ticket"
                >
                  <span>Chrome Extension</span>
                  {isChromeExtLabel ? <span>✓</span> : <span style={{ opacity: 0.5 }}>+</span>}
                </button>
              </div>
            </div>
            <select
              className="form-select"
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
            >
              <option value="">Auto by Type</option>
              {selectedTeam?.labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Page URL */}
        <div className="form-group">
          <div className="label-row">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Link2 size={12} color="#5E6AD2" />
              <span>Page URL</span>
            </label>
            {currentUrl && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn-micro"
                  onClick={async () => {
                    await navigator.clipboard.writeText(currentUrl);
                    showToast('URL copied to clipboard!');
                  }}
                  title="Copy URL"
                >
                  <Copy size={11} />
                  <span>Copy</span>
                </button>
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-micro"
                  title="Open URL in new tab"
                >
                  <ExternalLink size={11} />
                </a>
              </div>
            )}
          </div>
          <input
            type="url"
            className="form-input"
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        {/* Title */}
        <div className="form-group">
          <label className="form-label">
            Title <span className="required">*</span>
          </label>
          <input
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue or improvement title..."
            required
          />
        </div>

        {/* Description */}
        <div className="form-group">
          <div className="label-row">
            <label className="form-label">Description (Markdown)</label>
            <button
              type="button"
              className="btn-micro"
              onClick={() => setDescription(getTemplateForType(ticketType))}
            >
              Reset Template
            </button>
          </div>
          <textarea
            className="form-textarea"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed description..."
          />
        </div>

        {/* Screenshot Section */}
        <div className="screenshot-section">
          <div className="screenshot-header">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeScreenshot}
                onChange={(e) => setIncludeScreenshot(e.target.checked)}
              />
              <span>Attach Page Screenshot</span>
            </label>
            <div className="screenshot-actions">
              <button
                type="button"
                className="btn-micro-accent"
                onClick={handleOpenAnnotator}
                title="Annotate screenshot with boxes, arrows, text"
              >
                <Edit3 size={12} />
                <span>Annotate</span>
              </button>
              <button
                type="button"
                className="btn-micro"
                onClick={captureScreenshot}
                title="Retake page screenshot"
              >
                <RefreshCw size={12} />
                <span>Retake</span>
              </button>
            </div>
          </div>

          <div className="screenshot-preview-box">
            {isCapturing ? (
              <div className="screenshot-loading">
                <div className="spinner" />
                <span>Capturing page...</span>
              </div>
            ) : screenshot ? (
              <>
                <img
                  src={screenshot}
                  alt="Captured page"
                  className="screenshot-img"
                  onClick={handleOpenAnnotator}
                  style={{ cursor: 'pointer' }}
                />
                {isAnnotated && <div className="annotated-badge">✓ Annotated</div>}
              </>
            ) : (
              <div className="screenshot-loading">
                <span>No screenshot available</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Footer */}
      <div className="ticket-form-footer">
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={isSubmitting}
          style={{ padding: '10px 14px', fontSize: '13px' }}
        >
          {isSubmitting ? (
            <>
              <div className="spinner" />
              <span>Creating Linear Ticket...</span>
            </>
          ) : (
            <>
              <span>Create Linear Ticket</span>
              <span className="btn-shortcut">⌘↵</span>
            </>
          )}
        </button>
      </div>
    </form>
  </div>
  );
};
