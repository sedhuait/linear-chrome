import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Activity,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Globe,
  Search,
  Tag,
} from 'lucide-react';
import { CreatedIssue, LinearWorkspaceData, LinearLabel } from '../types/linear';
import { MappingRule, PageMetadata, TicketType } from '../types/mapping';
import { NetworkLogEntry } from '../types/network';
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
  isDomainAllowed?: boolean;
  currentDomain?: string;
  isSystemPage?: boolean;
  onWhitelistDomain?: (domain: string) => Promise<void>;
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
  isDomainAllowed = true,
  currentDomain = '',
  isSystemPage = false,
  onWhitelistDomain,
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
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [isLabelPickerOpen, setIsLabelPickerOpen] = useState<boolean>(false);
  const [labelSearch, setLabelSearch] = useState<string>('');
  const labelPickerRef = useRef<HTMLDivElement>(null);
  const prevTicketTypeRef = useRef<TicketType>(ticketType);
  const initializedLabelsRef = useRef<boolean>(false);
  const [isEngineering, setIsEngineering] = useState<boolean>(true);
  const [isChromeExtLabel, setIsChromeExtLabel] = useState<boolean>(true);
  const [bugCategory, setBugCategory] = useState<'UI' | 'API' | null>(null);
  const [networkLogs, setNetworkLogs] = useState<NetworkLogEntry[]>([]);
  const [includeNetworkLogs, setIncludeNetworkLogs] = useState<boolean>(true);
  const [showNetworkDetails, setShowNetworkDetails] = useState<boolean>(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
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
  const userEditedTitleRef = useRef<boolean>(false);
  const userEditedUrlRef = useRef<boolean>(false);

  const selectedTeam = workspace?.teams?.find((t) => t.id === teamId);
  const availableProjects = selectedTeam?.projects || workspace?.projects || [];

  const allAvailableLabels: LinearLabel[] = useMemo(() => {
    const list: LinearLabel[] = [];
    const seen = new Set<string>();

    if (selectedTeam?.labels) {
      for (const l of selectedTeam.labels) {
        if (!seen.has(l.id)) {
          seen.add(l.id);
          list.push(l);
        }
      }
    }

    if (workspace?.labels) {
      for (const l of workspace.labels) {
        if (!seen.has(l.id)) {
          seen.add(l.id);
          list.push(l);
        }
      }
    }

    return list;
  }, [selectedTeam, workspace]);

  const findLabelByName = useCallback(
    (name: string): LinearLabel | undefined => {
      const clean = name.trim().toLowerCase();
      return allAvailableLabels.find((l) => l.name.toLowerCase() === clean);
    },
    [allAvailableLabels]
  );

  const toggleLabel = useCallback((idOrName: string) => {
    setSelectedLabelIds((prev) => {
      if (prev.includes(idOrName)) {
        return prev.filter((id) => id !== idOrName);
      } else {
        return [...prev, idOrName];
      }
    });
  }, []);

  const getLabelDisplayInfo = useCallback(
    (idOrNamed: string) => {
      if (idOrNamed.startsWith('named:')) {
        const name = idOrNamed.replace('named:', '');
        const matching = allAvailableLabels.find((l) => l.name.toLowerCase() === name.toLowerCase());
        let defaultColor = '#5E6AD2';
        if (name.toLowerCase() === 'chrome extension') defaultColor = '#26B5CE';
        if (name.toLowerCase() === 'ui') defaultColor = '#F2994A';
        if (name.toLowerCase() === 'api') defaultColor = '#EB5757';
        if (name.toLowerCase() === 'bug') defaultColor = '#EB5757';
        if (name.toLowerCase() === 'feature') defaultColor = '#38EF7D';
        return {
          name,
          color: matching?.color || defaultColor,
        };
      }
      const found = allAvailableLabels.find((l) => l.id === idOrNamed);
      return {
        name: found?.name || idOrNamed,
        color: found?.color || '#5E6AD2',
      };
    },
    [allAvailableLabels]
  );

  const filteredLabels = useMemo(() => {
    if (!labelSearch.trim()) return allAvailableLabels;
    const term = labelSearch.toLowerCase().trim();
    return allAvailableLabels.filter((l) => l.name.toLowerCase().includes(term));
  }, [allAvailableLabels, labelSearch]);

  const engLabel = findLabelByName('Engineering');
  const isEngineeringActive = Boolean(
    (engLabel && selectedLabelIds.includes(engLabel.id)) ||
    selectedLabelIds.includes('named:Engineering')
  );

  const chromeLabel = findLabelByName('Chrome Extension') || findLabelByName('ChromeExtension');
  const isChromeExtActive = Boolean(
    (chromeLabel && selectedLabelIds.includes(chromeLabel.id)) ||
    selectedLabelIds.includes('named:Chrome Extension')
  );

  const uiLabel = findLabelByName('UI');
  const isUiActive = Boolean(
    (uiLabel && selectedLabelIds.includes(uiLabel.id)) ||
    selectedLabelIds.includes('named:UI') ||
    bugCategory === 'UI'
  );

  const apiLabel = findLabelByName('API');
  const isApiActive = Boolean(
    (apiLabel && selectedLabelIds.includes(apiLabel.id)) ||
    selectedLabelIds.includes('named:API') ||
    bugCategory === 'API'
  );

  const toggleEngineering = () => {
    const target = engLabel ? engLabel.id : 'named:Engineering';
    toggleLabel(target);
  };

  const toggleChromeExt = () => {
    const target = chromeLabel ? chromeLabel.id : 'named:Chrome Extension';
    toggleLabel(target);
  };

  const toggleUi = () => {
    const target = uiLabel ? uiLabel.id : 'named:UI';
    toggleLabel(target);
    setBugCategory((prev) => (prev === 'UI' ? null : 'UI'));
  };

  const toggleApi = () => {
    const target = apiLabel ? apiLabel.id : 'named:API';
    toggleLabel(target);
    setBugCategory((prev) => (prev === 'API' ? null : 'API'));
  };

  // Close multi-select dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (labelPickerRef.current && !labelPickerRef.current.contains(e.target as Node)) {
        setIsLabelPickerOpen(false);
      }
    };
    if (isLabelPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLabelPickerOpen]);

  // Fetch captured API request/response logs from active tab
  const fetchNetworkLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_NETWORK_LOGS' });
      if (response && response.success && Array.isArray(response.logs)) {
        setNetworkLogs(response.logs);
        // Auto-suggest API bug category if any recent call failed
        const hasFailedCalls = response.logs.some((l: NetworkLogEntry) => l.status >= 400 || l.status === 0);
        if (hasFailedCalls) {
          setBugCategory((prev) => (prev === null ? 'API' : prev));
        }
      }
    } catch (e) {
      console.warn('Could not retrieve network logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (isDomainAllowed && !isSystemPage) {
      fetchNetworkLogs();
    }
  }, [fetchNetworkLogs, isDomainAllowed, isSystemPage]);

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
      } else if (matchedRule.labelName) {
        const found =
          workspace?.labels.find((l) => l.name.toLowerCase() === matchedRule.labelName?.toLowerCase()) ||
          workspace?.teams.find((t) => t.id === targetTeamId)?.labels.find((l) => l.name.toLowerCase() === matchedRule.labelName?.toLowerCase());
        if (found) {
          setLabelId(found.id);
        }
      }
    } else if (workspace.teams.length > 0) {
      targetTeamId = workspace.teams[0].id;
    }

    setTeamId(targetTeamId);
    setProjectId(targetProjectId);
  }, [workspace, matchedRule]);

  // Set default title, URL, and description template from active page metadata
  useEffect(() => {
    if (pageMetadata) {
      if (pageMetadata.url && !userEditedUrlRef.current && !hasRestoredDraft) {
        setCurrentUrl(pageMetadata.url);
      }
      const pageTitleName = pageMetadata.title || pageMetadata.heading || pageMetadata.hostname;
      if (!userEditedTitleRef.current && !hasRestoredDraft && pageTitleName) {
        setTitle(`[${ticketType}] ${pageTitleName}`);
      }
    }
  }, [pageMetadata, ticketType, hasRestoredDraft]);

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
    if (settings.autoCaptureOnOpen && isDomainAllowed && !isSystemPage) {
      captureScreenshot();
    }
  }, [settings.autoCaptureOnOpen, captureScreenshot, isDomainAllowed, isSystemPage]);

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

  // Multi-selected default labels: Ticket Type, Engineering, Chrome Extension, and mapped rule label
  useEffect(() => {
    if (!workspace || !teamId || hasRestoredDraft) return;

    if (!initializedLabelsRef.current) {
      const defaults: string[] = [];

      // 1. Ticket type (e.g. Bug)
      const typeLabel = findLabelByName(ticketType);
      defaults.push(typeLabel ? typeLabel.id : `named:${ticketType}`);

      // 2. Engineering
      const eng = findLabelByName('Engineering');
      defaults.push(eng ? eng.id : 'named:Engineering');

      // 3. Chrome Extension
      const ch = findLabelByName('Chrome Extension') || findLabelByName('ChromeExtension');
      defaults.push(ch ? ch.id : 'named:Chrome Extension');

      // 4. Mapped Rule Label (if any)
      if (matchedRule?.labelId) {
        defaults.push(matchedRule.labelId);
      } else if (matchedRule?.labelName) {
        const mapped = findLabelByName(matchedRule.labelName);
        defaults.push(mapped ? mapped.id : `named:${matchedRule.labelName}`);
      }

      setSelectedLabelIds(Array.from(new Set(defaults)));
      initializedLabelsRef.current = true;
    }
  }, [workspace, teamId, ticketType, matchedRule, findLabelByName, hasRestoredDraft]);

  // When ticketType changes, swap ticket type label in selectedLabelIds
  useEffect(() => {
    if (prevTicketTypeRef.current !== ticketType) {
      const oldType = prevTicketTypeRef.current;
      const oldLabel = findLabelByName(oldType);
      const newLabel = findLabelByName(ticketType);
      const oldTargetId = oldLabel ? oldLabel.id : `named:${oldType}`;
      const newTargetId = newLabel ? newLabel.id : `named:${ticketType}`;

      setSelectedLabelIds((prev) => {
        const filtered = prev.filter((id) => id !== oldTargetId && id !== `named:${oldType}`);
        if (!filtered.includes(newTargetId)) {
          return [newTargetId, ...filtered];
        }
        return filtered;
      });
      prevTicketTypeRef.current = ticketType;
    }
  }, [ticketType, findLabelByName]);

  // Load saved draft on mount
  useEffect(() => {
    async function loadDraft() {
      try {
        const draft = await StorageService.getDraft();
        if (draft && Date.now() - draft.updatedAt < 24 * 60 * 60 * 1000) {
          // Only restore if the draft belongs to the active page
          const isSamePage = !pageMetadata?.url || draft.currentUrl === pageMetadata.url;

          if (isSamePage) {
            if (draft.title) {
              setTitle(draft.title);
              userEditedTitleRef.current = true;
            }
            if (draft.description) setDescription(draft.description);
            if (draft.currentUrl) {
              setCurrentUrl(draft.currentUrl);
            }
            if (draft.ticketType) setTicketType(draft.ticketType);
            if (draft.teamId) setTeamId(draft.teamId);
            if (draft.projectId) setProjectId(draft.projectId);
            if (draft.priority !== undefined) setPriority(draft.priority);
            if (draft.labelId) setLabelId(draft.labelId);
            if (Array.isArray(draft.selectedLabelIds) && draft.selectedLabelIds.length > 0) {
              setSelectedLabelIds(draft.selectedLabelIds);
              initializedLabelsRef.current = true;
            } else if (draft.labelId) {
              setSelectedLabelIds([draft.labelId]);
              initializedLabelsRef.current = true;
            }
            if (draft.isEngineering !== undefined) setIsEngineering(draft.isEngineering);
            if (draft.isChromeExtLabel !== undefined) setIsChromeExtLabel(draft.isChromeExtLabel);
            if (draft.bugCategory !== undefined) setBugCategory(draft.bugCategory);
            if (draft.includeNetworkLogs !== undefined) setIncludeNetworkLogs(draft.includeNetworkLogs);
            if (draft.screenshot) {
              setScreenshot(draft.screenshot);
              setIsAnnotated(draft.isAnnotated);
            }
            setHasRestoredDraft(true);
          } else {
            // Draft was for a DIFFERENT page. Do not overwrite current page URL/title.
            await StorageService.clearDraft();
            if (pageMetadata?.url) {
              setCurrentUrl(pageMetadata.url);
            }
            const pageTitleName = pageMetadata?.title || pageMetadata?.heading || pageMetadata?.hostname;
            if (pageTitleName) {
              setTitle(`[${ticketType}] ${pageTitleName}`);
            }
          }
        }
      } catch (e) {
        console.warn('Draft load warning:', e);
      } finally {
        draftLoadedRef.current = true;
      }
    }
    loadDraft();
  }, [pageMetadata?.url]);

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
          selectedLabelIds,
          isEngineering,
          isChromeExtLabel,
          bugCategory,
          includeNetworkLogs,
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
  }, [ticketType, teamId, projectId, priority, labelId, selectedLabelIds, isEngineering, isChromeExtLabel, bugCategory, includeNetworkLogs, title, description, currentUrl, screenshot, isAnnotated, getTemplateForType]);

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

      // 3. Append Network API Logs (if enabled and logs exist)
      if (includeNetworkLogs && networkLogs.length > 0) {
        const errorLogs = networkLogs.filter((l) => l.status >= 400 || l.status === 0);
        finalDescription += `\n\n<details><summary><strong>🌐 Network API Requests (${networkLogs.length} logged${errorLogs.length > 0 ? `, ${errorLogs.length} failed 🔴` : ''})</strong></summary>\n\n`;

        finalDescription += `| Method | Status | Duration | URL |\n| :--- | :--- | :--- | :--- |\n`;
        networkLogs.slice(0, 15).forEach((log) => {
          const statusDisplay = log.status === 0 ? '❌ Failed' : log.status >= 400 ? `🔴 ${log.status}` : `🟢 ${log.status}`;
          const shortUrl = log.url.length > 70 ? log.url.slice(0, 70) + '…' : log.url;
          finalDescription += `| \`${log.method}\` | ${statusDisplay} | ${log.durationMs}ms | \`${shortUrl}\` |\n`;
        });

        const notableLogs = networkLogs.filter((l) => l.status >= 400 || l.status === 0 || l.requestBody || l.responseBody).slice(0, 5);
        if (notableLogs.length > 0) {
          finalDescription += `\n#### Notable Request & Response Payloads\n`;
          notableLogs.forEach((log) => {
            finalDescription += `\n<details><summary><code>${log.method}</code> ${log.url} (Status: ${log.status || 'ERR'})</summary>\n\n`;
            if (log.error) {
              finalDescription += `**Error:** \`${log.error}\`\n\n`;
            }
            if (log.requestBody) {
              finalDescription += `**Request Payload:**\n\`\`\`json\n${log.requestBody}\n\`\`\`\n\n`;
            }
            if (log.responseBody) {
              finalDescription += `**Response Body:**\n\`\`\`json\n${log.responseBody}\n\`\`\`\n\n`;
            }
            finalDescription += `</details>\n`;
          });
        }

        finalDescription += `\n</details>`;
      }

      // 4. Collect and resolve all multi-selected label IDs
      const labelIdsToApply: string[] = [];
      const appliedLabelNames: string[] = [];

      for (const idOrNamed of selectedLabelIds) {
        if (idOrNamed.startsWith('named:')) {
          const labelName = idOrNamed.replace('named:', '').trim();
          const existing =
            selectedTeam?.labels.find((l) => l.name.toLowerCase() === labelName.toLowerCase()) ||
            workspace?.labels.find((l) => l.name.toLowerCase() === labelName.toLowerCase());
          if (existing) {
            if (!labelIdsToApply.includes(existing.id)) {
              labelIdsToApply.push(existing.id);
              appliedLabelNames.push(existing.name);
            }
          } else {
            try {
              let color = '#5E6AD2';
              if (labelName.toLowerCase() === 'chrome extension') color = '#26B5CE';
              else if (labelName.toLowerCase() === 'ui') color = '#F2994A';
              else if (labelName.toLowerCase() === 'api') color = '#EB5757';
              else if (labelName.toLowerCase() === 'bug') color = '#EB5757';
              else if (labelName.toLowerCase() === 'feature') color = '#38EF7D';
              const created = await linearClient.getOrCreateLabel(labelName, teamId, color);
              if (created && !labelIdsToApply.includes(created.id)) {
                labelIdsToApply.push(created.id);
                appliedLabelNames.push(created.name);
              }
            } catch (e) {
              console.warn(`Could not auto-create label "${labelName}":`, e);
            }
          }
        } else {
          const lObj =
            selectedTeam?.labels.find((l) => l.id === idOrNamed) ||
            workspace?.labels.find((l) => l.id === idOrNamed);
          if (!labelIdsToApply.includes(idOrNamed)) {
            labelIdsToApply.push(idOrNamed);
            if (lObj) appliedLabelNames.push(lObj.name);
          }
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
        const selectedLabel = workspace?.labels.find((l) => l.id === labelId) || selectedTeam?.labels.find((l) => l.id === labelId);
        await StorageService.setDomainPref(pageMetadata.hostname, {
          teamId,
          projectId,
          labelId: labelId || undefined,
          labelName: selectedLabel?.name || matchedRule?.labelName,
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

  if (isAnnotating && screenshot) {
    return (
      <InlineAnnotator
        imageSrc={screenshot}
        onSave={handleSaveAnnotation}
        onCancel={() => setIsAnnotating(false)}
      />
    );
  }

  if (isSystemPage) {
    return (
      <div className="whitelist-gate-view">
        <div className="whitelist-gate-card">
          <div className="whitelist-gate-icon system">
            <Lock size={32} color="#8B90A4" />
          </div>
          <h3 className="whitelist-gate-title">Browser System Page</h3>
          <p className="whitelist-gate-desc">
            Chrome prevents extensions from reading or capturing internal system pages (such as
            <code>chrome://</code>, <code>devtools://</code>, or <code>about:blank</code>).
          </p>
          <p className="whitelist-gate-hint">
            Navigate to an active website tab or localhost to start creating Linear tickets.
          </p>
        </div>
      </div>
    );
  }

  if (isDomainAllowed === false) {
    return (
      <div className="whitelist-gate-view">
        <div className="whitelist-gate-card">
          <div className="whitelist-gate-icon">
            <ShieldAlert size={36} color="#F2994A" />
          </div>
          <h3 className="whitelist-gate-title">Domain Not Whitelisted</h3>
          <div className="whitelist-gate-domain-badge">
            <Globe size={13} color="#8B90A4" />
            <span>{currentDomain || 'Unknown Domain'}</span>
          </div>
          <p className="whitelist-gate-desc">
            To protect your privacy and ensure this extension only runs where intended, Linear Ticket
            Creator does not read page data, capture screenshots, or inspect network traffic on
            unapproved websites.
          </p>

          <div className="whitelist-gate-actions">
            {onWhitelistDomain && currentDomain && (
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => onWhitelistDomain(currentDomain)}
              >
                <ShieldCheck size={15} style={{ marginRight: 6 }} />
                <span>Whitelist & Start Reading</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={onOpenSettings}
            >
              Configure Whitelisted Domains
            </button>
          </div>

          <div className="whitelist-gate-footer">
            <small>Localhost and 127.0.0.1 are always whitelisted by default.</small>
          </div>
        </div>
      </div>
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
                } ${matchedRule.labelName ? `| 🏷️ ${matchedRule.labelName}` : ''} (${matchReason})`
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
                  className={`btn-micro ${isEngineeringActive ? 'active' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: isEngineeringActive ? '1px solid #5E6AD2' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: isEngineeringActive ? 'rgba(94, 106, 210, 0.2)' : 'transparent',
                    color: isEngineeringActive ? '#8B97FF' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontWeight: isEngineeringActive ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={toggleEngineering}
                  title="Toggle 'Engineering' label"
                >
                  <span>Engineering</span>
                  {isEngineeringActive ? <span>✓</span> : <span style={{ opacity: 0.5 }}>+</span>}
                </button>
                <button
                  type="button"
                  className={`btn-micro ${isChromeExtActive ? 'active' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: isChromeExtActive ? '1px solid #26B5CE' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: isChromeExtActive ? 'rgba(38, 181, 206, 0.2)' : 'transparent',
                    color: isChromeExtActive ? '#26B5CE' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontWeight: isChromeExtActive ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={toggleChromeExt}
                  title="Toggle 'Chrome Extension' label"
                >
                  <span>Chrome Extension</span>
                  {isChromeExtActive ? <span>✓</span> : <span style={{ opacity: 0.5 }}>+</span>}
                </button>
                <button
                  type="button"
                  className={`btn-micro ${isUiActive ? 'active' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: isUiActive ? '1px solid #F2994A' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: isUiActive ? 'rgba(242, 153, 74, 0.25)' : 'transparent',
                    color: isUiActive ? '#F2994A' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontWeight: isUiActive ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={toggleUi}
                  title="Tag as UI"
                >
                  <span>🎨 UI</span>
                  {isUiActive ? <span>✓</span> : <span style={{ opacity: 0.5 }}>+</span>}
                </button>
                <button
                  type="button"
                  className={`btn-micro ${isApiActive ? 'active' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: isApiActive ? '1px solid #EB5757' : '1px solid rgba(255, 255, 255, 0.15)',
                    background: isApiActive ? 'rgba(235, 87, 87, 0.25)' : 'transparent',
                    color: isApiActive ? '#EB5757' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontWeight: isApiActive ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={toggleApi}
                  title="Tag as API"
                >
                  <span>⚡ API</span>
                  {isApiActive ? <span>✓</span> : <span style={{ opacity: 0.5 }}>+</span>}
                </button>
              </div>
            </div>

            {/* Multi-Select Dropdown Container */}
            <div className="multiselect-container" ref={labelPickerRef} style={{ position: 'relative' }}>
              <div
                className={`multiselect-trigger ${isLabelPickerOpen ? 'focused' : ''}`}
                onClick={() => setIsLabelPickerOpen(!isLabelPickerOpen)}
                style={{
                  minHeight: 32,
                  padding: '4px 8px',
                  background: 'var(--bg-input)',
                  border: isLabelPickerOpen ? '1px solid var(--border-focus)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', flex: 1, minWidth: 0 }}>
                  {selectedLabelIds.length === 0 ? (
                    <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>Select labels...</span>
                  ) : (
                    selectedLabelIds.map((idOrNamed) => {
                      const labelInfo = getLabelDisplayInfo(idOrNamed);
                      return (
                        <span
                          key={idOrNamed}
                          className="label-chip"
                          style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: `${labelInfo.color}22`,
                            border: `1px solid ${labelInfo.color}66`,
                            color: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            maxWidth: '150px',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: labelInfo.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {labelInfo.name}
                          </span>
                          <span
                            role="button"
                            style={{
                              cursor: 'pointer',
                              opacity: 0.7,
                              marginLeft: 2,
                              fontSize: '12px',
                              lineHeight: 1,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLabel(idOrNamed);
                            }}
                            title="Remove label"
                          >
                            ×
                          </span>
                        </span>
                      );
                    })
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {selectedLabelIds.length > 0 && (
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      {selectedLabelIds.length}
                    </span>
                  )}
                  {isLabelPickerOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
              </div>

              {/* Dropdown Menu */}
              {isLabelPickerOpen && (
                <div
                  className="multiselect-dropdown"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                    maxHeight: 220,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Search size={12} color="var(--text-muted)" />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search or add label..."
                      value={labelSearch}
                      onChange={(e) => setLabelSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        height: 24,
                        fontSize: '11.5px',
                        padding: '2px 6px',
                        background: 'transparent',
                        border: 'none',
                      }}
                      autoFocus
                    />
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                    {filteredLabels.map((lbl) => {
                      const isSelected = selectedLabelIds.includes(lbl.id) || selectedLabelIds.includes(`named:${lbl.name}`);
                      return (
                        <div
                          key={lbl.id}
                          className="multiselect-option"
                          style={{
                            padding: '6px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontSize: '12px',
                            background: isSelected ? 'rgba(94, 106, 210, 0.12)' : 'transparent',
                          }}
                          onClick={() => toggleLabel(lbl.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: lbl.color || '#5E6AD2',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1, color: 'var(--text-main)' }}>{lbl.name}</span>
                        </div>
                      );
                    })}

                    {filteredLabels.length === 0 && !labelSearch.trim() && (
                      <div style={{ padding: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px' }}>
                        No labels available
                      </div>
                    )}

                    {labelSearch.trim() && !allAvailableLabels.some((l) => l.name.toLowerCase() === labelSearch.trim().toLowerCase()) && (
                      <div
                        className="multiselect-option add-new"
                        style={{
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: '#8B97FF',
                          borderTop: '1px dashed var(--border-color)',
                        }}
                        onClick={() => {
                          const customTag = `named:${labelSearch.trim()}`;
                          toggleLabel(customTag);
                          setLabelSearch('');
                        }}
                      >
                        <Tag size={12} />
                        <span>Add "{labelSearch.trim()}"</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page URL */}
        <div className="form-group">
          <div className="label-row">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Link2 size={12} color="#5E6AD2" />
              <span>Page URL</span>
            </label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {pageMetadata?.url && currentUrl !== pageMetadata.url && (
                <button
                  type="button"
                  className="btn-micro"
                  onClick={() => {
                    setCurrentUrl(pageMetadata.url);
                    userEditedUrlRef.current = false;
                    showToast('Reset to active page URL');
                  }}
                  title={`Reset to active tab URL: ${pageMetadata.url}`}
                >
                  Reset to Tab URL
                </button>
              )}
              {currentUrl && (
                <>
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
                </>
              )}
            </div>
          </div>
          <input
            type="url"
            className="form-input"
            value={currentUrl}
            onChange={(e) => {
              setCurrentUrl(e.target.value);
              userEditedUrlRef.current = true;
            }}
            placeholder="https://..."
          />
        </div>

        {/* Title */}
        <div className="form-group">
          <div className="label-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label className="form-label" style={{ margin: 0 }}>
              Title <span className="required">*</span>
            </label>
            {pageMetadata?.title && (
              <button
                type="button"
                className="btn-micro"
                style={{ fontSize: '10.5px' }}
                onClick={() => {
                  setTitle(pageMetadata.title);
                  userEditedTitleRef.current = true;
                  showToast(`Set title to "${pageMetadata.title}"`);
                }}
                title={`Fill with page title: "${pageMetadata.title}"`}
              >
                Use Page Title ({pageMetadata.title.length > 20 ? pageMetadata.title.slice(0, 20) + '…' : pageMetadata.title})
              </button>
            )}
          </div>
          <input
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              userEditedTitleRef.current = true;
            }}
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

        {/* Network API Requests Capture Section */}
        <div
          className="network-logs-section"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            marginBottom: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
            }}
          >
            <label
              className="checkbox-label"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                margin: 0,
              }}
            >
              <input
                type="checkbox"
                checked={includeNetworkLogs}
                onChange={(e) => setIncludeNetworkLogs(e.target.checked)}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Activity size={13} color="#26B5CE" />
                <span>Attach Network API Calls</span>
              </span>
              {networkLogs.length > 0 ? (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: networkLogs.some((l) => l.status >= 400 || l.status === 0)
                      ? 'rgba(235, 87, 87, 0.25)'
                      : 'rgba(94, 106, 210, 0.2)',
                    color: networkLogs.some((l) => l.status >= 400 || l.status === 0) ? '#EB5757' : '#8B97FF',
                    fontWeight: 600,
                  }}
                >
                  {networkLogs.length} requests
                  {networkLogs.filter((l) => l.status >= 400 || l.status === 0).length > 0 &&
                    ` (${networkLogs.filter((l) => l.status >= 400 || l.status === 0).length} ❌)`}
                </span>
              ) : (
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>(0 captured)</span>
              )}
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="btn-micro"
                onClick={fetchNetworkLogs}
                disabled={isLoadingLogs}
                title="Refresh captured network requests"
                style={{ padding: '2px 6px', fontSize: '10px' }}
              >
                <RefreshCw size={11} className={isLoadingLogs ? 'animate-spin' : ''} />
                <span>{isLoadingLogs ? 'Scanning...' : 'Refresh'}</span>
              </button>
              {networkLogs.length > 0 && (
                <button
                  type="button"
                  className="btn-micro"
                  onClick={() => setShowNetworkDetails(!showNetworkDetails)}
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  title="Expand / collapse network request logs"
                >
                  {showNetworkDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>{showNetworkDetails ? 'Hide' : 'Inspect'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Collapsible preview table */}
          {showNetworkDetails && networkLogs.length > 0 && (
            <div
              style={{
                marginTop: 10,
                maxHeight: 180,
                overflowY: 'auto',
                fontSize: '11px',
                borderTop: '1px solid var(--border-color)',
                paddingTop: 8,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {networkLogs.slice(0, 20).map((log, idx) => {
                  const isError = log.status >= 400 || log.status === 0;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 6px',
                        borderRadius: 4,
                        background: isError ? 'rgba(235, 87, 87, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                        borderLeft: `3px solid ${isError ? '#EB5757' : '#27AE60'}`,
                        fontFamily: 'monospace',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: log.method === 'POST' ? '#F2994A' : log.method === 'GET' ? '#26B5CE' : '#A259FF',
                            fontSize: '10px',
                          }}
                        >
                          {log.method}
                        </span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--text-secondary)',
                            fontSize: '10.5px',
                          }}
                          title={log.url}
                        >
                          {log.url.replace(/^https?:\/\/[^/]+/, '') || log.url}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{log.durationMs}ms</span>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: '10px',
                            color: isError ? '#EB5757' : '#27AE60',
                          }}
                        >
                          {log.status === 0 ? 'FAIL' : log.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
