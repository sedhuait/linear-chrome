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
  Trash2,
  Plus,
  Camera,
} from 'lucide-react';
import { CreatedIssue, LinearWorkspaceData, LinearLabel } from '../types/linear';
import { MappingRule, PageMetadata, TicketType } from '../types/mapping';
import { NetworkLogEntry } from '../types/network';
import { LinearApiClient } from '../services/linear-api';
import { StorageService, ExtensionSettings, CapturedScreenshot } from '../services/storage';
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
  activeTabId?: number;
  onWhitelistDomain?: (domain: string) => Promise<void>;
  onRefreshContext?: () => void;
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
  activeTabId,
  onWhitelistDomain,
  onRefreshContext,
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
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(null);
  const [includeNetworkLogs, setIncludeNetworkLogs] = useState<boolean>(true);
  const [showNetworkDetails, setShowNetworkDetails] = useState<boolean>(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [includeScreenshot, setIncludeScreenshot] = useState<boolean>(
    settings.includeScreenshotByDefault
  );
  const [screenshots, setScreenshots] = useState<CapturedScreenshot[]>([]);
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState<number>(0);
  const [isAnnotating, setIsAnnotating] = useState<boolean>(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(false);

  const activeScreenshot = screenshots[activeScreenshotIndex] || screenshots[0] || null;
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdIssue, setCreatedIssue] = useState<CreatedIssue | null>(null);
  const [isWhitelisting, setIsWhitelisting] = useState<boolean>(false);
  const draftLoadedRef = useRef<boolean>(false);
  const userEditedTitleRef = useRef<boolean>(false);
  const userEditedUrlRef = useRef<boolean>(false);
  const hasAutoSelectedLogsRef = useRef<boolean>(false);

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

    // If the matched rule restricts allowed project labels, filter to ONLY those labels!
    if (matchedRule?.allowedLabels && matchedRule.allowedLabels.length > 0) {
      const allowedLower = matchedRule.allowedLabels.map((n) => n.trim().toLowerCase());
      const filtered = list.filter(
        (l) => allowedLower.includes(l.name.toLowerCase()) || allowedLower.includes(l.id.toLowerCase())
      );
      // Ensure any custom allowed labels not yet in Linear are also available in the list
      matchedRule.allowedLabels.forEach((name) => {
        const clean = name.trim();
        const exists = filtered.some((l) => l.name.toLowerCase() === clean.toLowerCase() || l.id === clean);
        if (!exists) {
          filtered.push({
            id: `named:${clean}`,
            name: clean,
            color: '#5E6AD2',
          });
        }
      });
      return filtered;
    }

    return list;
  }, [selectedTeam, workspace, matchedRule]);

  const findLabelByName = useCallback(
    (name: string): LinearLabel | undefined => {
      const clean = name.trim().toLowerCase();
      const inAvailable = allAvailableLabels.find((l) => l.name.toLowerCase() === clean);
      if (inAvailable) return inAvailable;
      if (selectedTeam?.labels) {
        const inTeam = selectedTeam.labels.find((l) => l.name.toLowerCase() === clean);
        if (inTeam) return inTeam;
      }
      if (workspace?.labels) {
        const inWs = workspace.labels.find((l) => l.name.toLowerCase() === clean);
        if (inWs) return inWs;
      }
      return undefined;
    },
    [allAvailableLabels, selectedTeam, workspace]
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

  const quickSuggestions = [
    {
      id: 'eng',
      name: 'Engineering',
      label: 'Engineering',
      active: isEngineeringActive,
      toggle: toggleEngineering,
      color: '#5E6AD2',
    },
    {
      id: 'ext',
      name: 'Chrome Extension',
      label: 'Chrome Extension',
      active: isChromeExtActive,
      toggle: toggleChromeExt,
      color: '#26B5CE',
    },
    {
      id: 'ui',
      name: 'UI',
      label: '🎨 UI',
      active: isUiActive,
      toggle: toggleUi,
      color: '#F2994A',
    },
    {
      id: 'api',
      name: 'API',
      label: '⚡ API',
      active: isApiActive,
      toggle: toggleApi,
      color: '#EB5757',
    },
  ];

  const unselectedSuggestions = useMemo(() => {
    return quickSuggestions.filter((s) => {
      if (s.active) return false;
      if (matchedRule?.allowedLabels && matchedRule.allowedLabels.length > 0) {
        const allowedLower = matchedRule.allowedLabels.map((a) => a.toLowerCase().trim());
        return allowedLower.includes(s.name.toLowerCase());
      }
      return true;
    });
  }, [quickSuggestions, matchedRule]);

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
  const fetchNetworkLogs = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoadingLogs(true);
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_NETWORK_LOGS',
          tabId: activeTabId,
        });
        if (response && response.success && Array.isArray(response.logs)) {
          const logs = response.logs as NetworkLogEntry[];

          setNetworkLogs((prevLogs) => {
            const hasChanged =
              prevLogs.length !== logs.length ||
              logs.some((l, i) => l.id !== prevLogs[i]?.id);

            if (!hasChanged) return prevLogs;

            setSelectedLogIds((prevSelected) => {
              // If previous selection was empty (e.g. initial load or just cleared), auto-select all (or errors)
              if (prevSelected.length === 0) {
                if (!hasAutoSelectedLogsRef.current) {
                  hasAutoSelectedLogsRef.current = true;
                  const errorLogs = logs.filter((l) => l.status >= 400 || l.status === 0);
                  return errorLogs.length > 0 ? errorLogs.map((l) => l.id) : logs.map((l) => l.id);
                }
                return prevSelected;
              }

              // Keep existing selections, plus automatically select any newly arriving failed requests
              const existingValid = prevSelected.filter((id) => logs.some((l) => l.id === id));
              const newLogs = logs.filter((l) => !prevLogs.some((pl) => pl.id === l.id));
              const newErrorIds = newLogs
                .filter((l) => l.status >= 400 || l.status === 0)
                .map((l) => l.id);

              return Array.from(new Set([...existingValid, ...newErrorIds]));
            });

            return logs;
          });

          // Auto-suggest API bug category if any recent call failed
          const hasFailedCalls = logs.some((l: NetworkLogEntry) => l.status >= 400 || l.status === 0);
          if (hasFailedCalls) {
            setBugCategory((prev) => (prev === null ? 'API' : prev));
          }
        }
      } catch (e) {
        console.warn('Could not retrieve network logs:', e);
      } finally {
        if (!silent) setIsLoadingLogs(false);
      }
    },
    [activeTabId]
  );

  // Clear captured network logs from the active page so fresh requests can be recorded
  const handleClearNetworkLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    hasAutoSelectedLogsRef.current = false;
    try {
      await chrome.runtime.sendMessage({
        type: 'CLEAR_NETWORK_LOGS',
        tabId: activeTabId,
      });
      setNetworkLogs([]);
      setSelectedLogIds([]);
      setExpandedPayloadId(null);
      showToast('Cleared network requests. Fresh requests will now be recorded.');
    } catch (e) {
      console.warn('Could not clear network logs:', e);
      setNetworkLogs([]);
      setSelectedLogIds([]);
      setExpandedPayloadId(null);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [activeTabId, showToast]);

  const toggleLogSelection = useCallback((id: string) => {
    setSelectedLogIds((prev) => {
      const willSelect = !prev.includes(id);
      if (willSelect) {
        setIncludeNetworkLogs(true);
      }
      return willSelect ? [...prev, id] : prev.filter((item) => item !== id);
    });
  }, []);

  // Initial fetch and live polling for fresh network requests while panel is open
  useEffect(() => {
    if (!isDomainAllowed || isSystemPage) return;

    fetchNetworkLogs(true);

    const interval = setInterval(() => {
      fetchNetworkLogs(true);
    }, 1500);

    return () => clearInterval(interval);
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

  // Capture screenshot (mode: 'add' appends a new screenshot; 'replace' retakes the active screenshot)
  const captureScreenshot = useCallback(
    async (mode: 'add' | 'replace' = 'add') => {
      setIsCapturing(true);
      try {
        const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
        if (response && response.success && response.dataUrl) {
          const newShot: CapturedScreenshot = {
            id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            dataUrl: response.dataUrl,
            isAnnotated: false,
            createdAt: Date.now(),
          };

          setScreenshots((prev) => {
            if (mode === 'replace' && prev.length > 0) {
              const updated = [...prev];
              const targetIdx = Math.min(activeScreenshotIndex, prev.length - 1);
              updated[targetIdx] = {
                ...updated[targetIdx],
                dataUrl: response.dataUrl,
                isAnnotated: false,
              };
              showToast(`✓ Screenshot #${targetIdx + 1} retaken!`);
              return updated;
            }

            const updated = [...prev, newShot];
            setActiveScreenshotIndex(updated.length - 1);
            showToast(
              prev.length === 0
                ? '✓ Screenshot captured!'
                : `✓ Screenshot #${updated.length} added!`
            );
            return updated;
          });

          setIncludeScreenshot(true);
        } else {
          showToast('Screenshot capture not permitted on this browser page');
        }
      } catch {
        showToast('Could not capture screenshot');
      } finally {
        setIsCapturing(false);
      }
    },
    [activeScreenshotIndex, showToast]
  );

  const removeScreenshot = useCallback(
    (indexToRemove: number) => {
      setScreenshots((prev) => {
        const next = prev.filter((_, i) => i !== indexToRemove);
        setActiveScreenshotIndex((prevIdx) => {
          if (next.length === 0) return 0;
          if (prevIdx >= next.length) return next.length - 1;
          if (prevIdx === indexToRemove) return Math.max(0, indexToRemove - 1);
          return prevIdx > indexToRemove ? prevIdx - 1 : prevIdx;
        });
        return next;
      });
      showToast('Screenshot removed.');
    },
    [showToast]
  );

  useEffect(() => {
    if (settings.autoCaptureOnOpen && isDomainAllowed && !isSystemPage) {
      if (screenshots.length === 0) {
        captureScreenshot('add');
      }
    }
  }, [settings.autoCaptureOnOpen, captureScreenshot, isDomainAllowed, isSystemPage, screenshots.length]);

  // Check if annotated image was saved
  useEffect(() => {
    const checkAnnotation = async () => {
      const data = await chrome.storage.local.get(['pending_screenshot', 'pending_screenshot_annotated']);
      if (data.pending_screenshot && data.pending_screenshot_annotated) {
        setScreenshots((prev) => {
          if (prev.length > 0) {
            const updated = [...prev];
            updated[0] = { ...updated[0], dataUrl: data.pending_screenshot, isAnnotated: true };
            return updated;
          }
          return [
            {
              id: `ss_${Date.now()}`,
              dataUrl: data.pending_screenshot,
              isAnnotated: true,
              createdAt: Date.now(),
            },
          ];
        });
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

      // 2. Engineering is always included by default
      const eng = findLabelByName('Engineering');
      defaults.push(eng ? eng.id : 'named:Engineering');

      // 3. Mapped Rule Default Labels
      if (Array.isArray(matchedRule?.labels) && matchedRule.labels.length > 0) {
        matchedRule.labels.forEach((lbl) => {
          const found = findLabelByName(lbl);
          defaults.push(found ? found.id : (lbl.startsWith('named:') ? lbl : `named:${lbl}`));
        });
      } else if (matchedRule?.labelId) {
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
            if (Array.isArray(draft.selectedNetworkLogIds)) {
              setSelectedLogIds(draft.selectedNetworkLogIds);
            }
            if (Array.isArray(draft.screenshots) && draft.screenshots.length > 0) {
              setScreenshots(draft.screenshots);
              setActiveScreenshotIndex(0);
            } else if (draft.screenshot) {
              setScreenshots([
                {
                  id: `ss_${Date.now()}`,
                  dataUrl: draft.screenshot,
                  isAnnotated: Boolean(draft.isAnnotated),
                  createdAt: Date.now(),
                },
              ]);
              setActiveScreenshotIndex(0);
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
      if (title.trim() || screenshots.length > 0 || (description && description !== getTemplateForType(ticketType))) {
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
          selectedNetworkLogIds: selectedLogIds,
          title,
          description,
          currentUrl,
          screenshot: screenshots[0]?.dataUrl || null,
          screenshots,
          isAnnotated: screenshots.some((s) => s.isAnnotated),
          updatedAt: Date.now(),
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ticketType, teamId, projectId, priority, labelId, selectedLabelIds, isEngineering, isChromeExtLabel, bugCategory, includeNetworkLogs, selectedLogIds, title, description, currentUrl, screenshots, getTemplateForType]);

  const handleClearDraft = async () => {
    await StorageService.clearDraft();
    setHasRestoredDraft(false);
    setTitle(`[${ticketType}] ${pageMetadata?.title || pageMetadata?.hostname || ''}`);
    setDescription(getTemplateForType(ticketType));
    setScreenshots([]);
    setActiveScreenshotIndex(0);
    captureScreenshot('add');
    showToast('Draft cleared.');
  };

  // Open inline annotator (no tab switching!)
  const handleOpenAnnotator = () => {
    if (!activeScreenshot) {
      showToast('No screenshot to annotate. Capture first.');
      return;
    }
    setIsAnnotating(true);
  };

  const handleSaveAnnotation = (annotatedDataUrl: string) => {
    setScreenshots((prev) =>
      prev.map((s, idx) =>
        idx === activeScreenshotIndex
          ? { ...s, dataUrl: annotatedDataUrl, isAnnotated: true }
          : s
      )
    );
    setIsAnnotating(false);
    showToast(`✓ Screenshot #${activeScreenshotIndex + 1} annotated & attached!`);
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
      const uploadedAssets: Array<{ name: string; url: string }> = [];

      // Prominently prepend captured page URL
      const targetUrl = currentUrl.trim();
      if (targetUrl) {
        finalDescription = `**Page URL:** [${targetUrl}](${targetUrl})\n\n` + finalDescription;
      }

      // 1. Upload screenshots if selected
      if (includeScreenshot && screenshots.length > 0) {
        for (let i = 0; i < screenshots.length; i++) {
          const shot = screenshots[i];
          const shotNum = i + 1;
          const labelName = `Screenshot ${shotNum}${shot.isAnnotated ? ' (Annotated)' : ''}`;
          const filename = shot.isAnnotated ? `annotated_screenshot_${shotNum}.png` : `screenshot_${shotNum}.png`;

          try {
            const blob = dataUrlToBlob(shot.dataUrl);
            const uploadedUrl = await linearClient.uploadScreenshot(blob, filename);
            uploadedAssets.push({ name: labelName, url: uploadedUrl });
          } catch (uploadErr) {
            console.warn(`Linear fileUpload failed for ${labelName}, embedding image directly in description markdown:`, uploadErr);
            uploadedAssets.push({ name: labelName, url: shot.dataUrl });
          }
        }

        if (uploadedAssets.length > 0) {
          finalDescription += `\n\n---\n### 📸 Screenshot${uploadedAssets.length > 1 ? `s (${uploadedAssets.length})` : ''}\n`;
          uploadedAssets.forEach((asset) => {
            finalDescription += `\n**${asset.name}**\n![${asset.name}](${asset.url})\n`;
          });
        }
      }

      // Helper to format and truncate JSON payloads for Linear markdown
      const formatPayload = (raw: string | undefined): string => {
        if (!raw) return '';
        try {
          const parsed = JSON.parse(raw);
          const pretty = JSON.stringify(parsed, null, 2);
          if (pretty.length > 3500) {
            return pretty.slice(0, 3500) + '\n... [truncated]';
          }
          return pretty;
        } catch {
          if (raw.length > 3500) {
            return raw.slice(0, 3500) + '\n... [truncated]';
          }
          return raw;
        }
      };

      // 2. Append environment & context details (clean native markdown, no raw HTML tags)
      if (settings.includeEnvInfo && pageMetadata) {
        finalDescription +=
          `\n\n---\n### 🌐 Environment Context\n` +
          `- **URL:** [${targetUrl || pageMetadata.url}](${targetUrl || pageMetadata.url})\n` +
          `- **Page Title:** ${pageMetadata.title}\n` +
          `- **Viewport:** ${pageMetadata.viewport.width} × ${pageMetadata.viewport.height}\n` +
          `- **User Agent:** \`${pageMetadata.userAgent}\`\n`;
      }

      // 3. Append Selected Network API Logs (clean native markdown tables & code blocks)
      const logsToAttach = networkLogs.filter((l) => selectedLogIds.includes(l.id));
      if (includeNetworkLogs && logsToAttach.length > 0) {
        const errorLogs = logsToAttach.filter((l) => l.status >= 400 || l.status === 0);
        finalDescription += `\n\n---\n### 🌐 Network API Requests (${logsToAttach.length} selected of ${networkLogs.length} logged${errorLogs.length > 0 ? `, ${errorLogs.length} failed 🔴` : ''})\n\n`;

        finalDescription += `| Method | Status | Duration | Endpoint |\n| :--- | :--- | :--- | :--- |\n`;
        logsToAttach.forEach((log) => {
          const statusDisplay = log.status === 0 ? '❌ Failed' : log.status >= 400 ? `🔴 ${log.status}` : `🟢 ${log.status}`;
          const shortUrl = log.url.length > 70 ? log.url.slice(0, 70) + '…' : log.url;
          finalDescription += `| \`${log.method}\` | ${statusDisplay} | ${log.durationMs}ms | \`${shortUrl}\` |\n`;
        });

        const notableLogs = logsToAttach.filter((l) => l.status >= 400 || l.status === 0 || l.requestBody || l.responseBody).slice(0, 10);
        if (notableLogs.length > 0) {
          finalDescription += `\n### 📦 Request & Response Payloads\n`;
          notableLogs.forEach((log) => {
            const statusDisplay = log.status === 0 ? '❌ Failed' : log.status >= 400 ? `🔴 ${log.status}` : `🟢 ${log.status}`;
            finalDescription += `\n#### \`${log.method}\` ${log.url}\n`;
            finalDescription += `**Status:** ${statusDisplay} • **Duration:** ${log.durationMs}ms\n\n`;

            if (log.error) {
              finalDescription += `**Error:** \`${log.error}\`\n\n`;
            }
            if (log.requestBody) {
              const formattedReq = formatPayload(log.requestBody);
              finalDescription += `**Request Payload:**\n\`\`\`json\n${formattedReq}\n\`\`\`\n\n`;
            }
            if (log.responseBody) {
              const formattedRes = formatPayload(log.responseBody);
              finalDescription += `**Response Body:**\n\`\`\`json\n${formattedRes}\n\`\`\`\n\n`;
            }
          });
        }
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

      // 5. Attach screenshot assets if uploaded
      for (const asset of uploadedAssets) {
        if (asset.url.startsWith('http')) {
          await linearClient.createAttachment(issue.id, asset.name, asset.url).catch((err) => {
            console.warn('Could not attach screenshot asset:', err);
          });
        }
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

  if (isAnnotating && activeScreenshot) {
    return (
      <InlineAnnotator
        imageSrc={activeScreenshot.dataUrl}
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
                onClick={async () => {
                  setIsWhitelisting(true);
                  try {
                    await onWhitelistDomain(currentDomain);
                  } finally {
                    setIsWhitelisting(false);
                  }
                }}
                disabled={isWhitelisting}
              >
                {isWhitelisting ? (
                  <RefreshCw size={15} className="animate-spin" style={{ marginRight: 6 }} />
                ) : (
                  <ShieldCheck size={15} style={{ marginRight: 6 }} />
                )}
                <span>{isWhitelisting ? 'Whitelisting & Refreshing...' : 'Whitelist & Start Reading'}</span>
              </button>
            )}
            {onRefreshContext && (
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={onRefreshContext}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                title="Re-inspect page context and project mapping rules"
              >
                <RefreshCw size={14} />
                <span>Re-check Active Page</span>
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
        <div className="form-row" style={{ alignItems: 'flex-start' }}>
          <div className="form-group" style={{ flex: '0 0 115px' }}>
            <label className="form-label">Priority</label>
            <select
              className="form-select"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10))}
              style={{ height: '34px' }}
            >
              <option value="0">No Priority</option>
              <option value="1">Urgent 🔴</option>
              <option value="2">High 🟠</option>
              <option value="3">Medium 🟡</option>
              <option value="4">Low 🔵</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Tag size={12} color="var(--text-muted)" />
                <span>Labels</span>
                {selectedLabelIds.length > 0 && (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '0 5px',
                      borderRadius: 8,
                      background: 'rgba(94, 106, 210, 0.2)',
                      color: '#8B97FF',
                      fontWeight: 600,
                    }}
                  >
                    {selectedLabelIds.length}
                  </span>
                )}
              </label>
              {selectedLabelIds.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedLabelIds([]);
                    setBugCategory(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '10.5px',
                    cursor: 'pointer',
                    padding: '0 2px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#EB5757')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Multi-Select Dropdown Container */}
            <div className="multiselect-container" ref={labelPickerRef} style={{ position: 'relative' }}>
              <div
                className={`multiselect-trigger ${isLabelPickerOpen ? 'focused' : ''}`}
                onClick={() => setIsLabelPickerOpen(!isLabelPickerOpen)}
                style={{
                  minHeight: 34,
                  padding: '4px 8px',
                  background: 'var(--bg-input)',
                  border: isLabelPickerOpen ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  boxShadow: isLabelPickerOpen ? '0 0 0 1px rgba(94, 106, 210, 0.25)' : 'none',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', flex: 1, minWidth: 0 }}>
                  {selectedLabelIds.length === 0 ? (
                    <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>+ Add labels...</span>
                  ) : (
                    selectedLabelIds.map((idOrNamed) => {
                      const labelInfo = getLabelDisplayInfo(idOrNamed);
                      return (
                        <span
                          key={idOrNamed}
                          className="label-chip"
                          style={{
                            fontSize: '11px',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: `${labelInfo.color}18`,
                            border: `1px solid ${labelInfo.color}44`,
                            color: 'var(--text-main)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            maxWidth: '140px',
                            lineHeight: '1.2',
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
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                            {labelInfo.name}
                          </span>
                          <span
                            role="button"
                            style={{
                              cursor: 'pointer',
                              opacity: 0.6,
                              marginLeft: 2,
                              fontSize: '13px',
                              lineHeight: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '12px',
                              height: '12px',
                              borderRadius: '2px',
                              transition: 'opacity 0.15s ease',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
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
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                    maxHeight: 260,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  {/* Search box */}
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

                  {/* Quick Tags row inside dropdown */}
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <div style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600 }}>
                      Quick Tags
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {quickSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => s.toggle()}
                          style={{
                            fontSize: '10.5px',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            border: s.active ? `1px solid ${s.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                            background: s.active ? `${s.color}22` : 'rgba(255, 255, 255, 0.03)',
                            color: s.active ? s.color : 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: s.active ? 600 : 400,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>{s.label}</span>
                          {s.active ? <span style={{ fontWeight: 700 }}>✓</span> : <span style={{ opacity: 0.5 }}>+</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable label list */}
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
                            transition: 'background 0.1s ease',
                          }}
                          onClick={() => toggleLabel(lbl.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
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
                          <span style={{ flex: 1, color: isSelected ? '#ffffff' : 'var(--text-main)', fontWeight: isSelected ? 500 : 400 }}>
                            {lbl.name}
                          </span>
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

            {/* Subtle Quick Add suggestions underneath (only showing unselected) */}
            {unselectedSuggestions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Quick add:</span>
                {unselectedSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={s.toggle}
                    style={{
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = s.color;
                      e.currentTarget.style.color = s.color;
                      e.currentTarget.style.background = `${s.color}15`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                  >
                    <span>{s.label}</span>
                    <span style={{ opacity: 0.5, fontSize: '9px' }}>+</span>
                  </button>
                ))}
              </div>
            )}
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
                checked={includeNetworkLogs && (networkLogs.length === 0 ? true : selectedLogIds.length > 0)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIncludeNetworkLogs(checked);
                  if (checked && selectedLogIds.length === 0 && networkLogs.length > 0) {
                    setSelectedLogIds(networkLogs.map((l) => l.id));
                  }
                }}
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
                    background: selectedLogIds.length > 0
                      ? 'rgba(94, 106, 210, 0.25)'
                      : 'rgba(255, 255, 255, 0.05)',
                    color: selectedLogIds.length > 0 ? '#8B97FF' : 'var(--text-tertiary)',
                    fontWeight: 600,
                  }}
                >
                  {selectedLogIds.length === networkLogs.length
                    ? `${networkLogs.length} requests (all selected)`
                    : `${selectedLogIds.length} of ${networkLogs.length} selected`}
                  {networkLogs.filter((l) => l.status >= 400 || l.status === 0).length > 0 &&
                    ` (${networkLogs.filter((l) => l.status >= 400 || l.status === 0).length} ❌)`}
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-tertiary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span>(0 captured)</span>
                  {isDomainAllowed && !isSystemPage && (
                    <span
                      style={{
                        color: '#27AE60',
                        fontSize: '9.5px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                      title="Ready to capture fresh network requests from this page"
                    >
                      <span>●</span>
                      <span>Listening</span>
                    </span>
                  )}
                </span>
              )}
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {networkLogs.length > 0 && (
                <button
                  type="button"
                  className="btn-micro"
                  onClick={handleClearNetworkLogs}
                  disabled={isLoadingLogs}
                  title="Clear captured network requests to capture fresh"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                >
                  <Trash2 size={11} />
                  <span>Clear</span>
                </button>
              )}
              <button
                type="button"
                className="btn-micro"
                onClick={() => fetchNetworkLogs(false)}
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
                  title="Choose which network requests to attach to ticket"
                >
                  {showNetworkDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>{showNetworkDetails ? 'Hide' : `Choose (${selectedLogIds.length})`}</span>
                </button>
              )}
            </div>
          </div>

          {/* Collapsible preview & selector table */}
          {showNetworkDetails && networkLogs.length > 0 && (
            <div
              style={{
                marginTop: 10,
                maxHeight: 240,
                overflowY: 'auto',
                fontSize: '11px',
                borderTop: '1px solid var(--border-color)',
                paddingTop: 8,
              }}
            >
              {/* Quick selection toolbar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  paddingBottom: 4,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Select calls to include in ticket:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    className="btn-micro"
                    onClick={() => {
                      setSelectedLogIds(networkLogs.map((l) => l.id));
                      setIncludeNetworkLogs(true);
                    }}
                    style={{ padding: '1px 5px', fontSize: '9.5px' }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="btn-micro"
                    onClick={() => setSelectedLogIds([])}
                    style={{ padding: '1px 5px', fontSize: '9.5px' }}
                  >
                    Deselect All
                  </button>
                  {networkLogs.some((l) => l.status >= 400 || l.status === 0) && (
                    <button
                      type="button"
                      className="btn-micro"
                      onClick={() => {
                        setSelectedLogIds(networkLogs.filter((l) => l.status >= 400 || l.status === 0).map((l) => l.id));
                        setIncludeNetworkLogs(true);
                      }}
                      style={{ padding: '1px 5px', fontSize: '9.5px', color: '#EB5757', borderColor: 'rgba(235, 87, 87, 0.3)' }}
                    >
                      Only Failed
                    </button>
                  )}
                </div>
              </div>

              {/* Network call items with individual checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {networkLogs.map((log) => {
                  const isSelected = selectedLogIds.includes(log.id);
                  const isError = log.status >= 400 || log.status === 0;
                  const isPayloadOpen = expandedPayloadId === log.id;
                  const hasPayload = Boolean(log.requestBody || log.responseBody || log.error);

                  return (
                    <div
                      key={log.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 4,
                        background: isSelected
                          ? isError
                            ? 'rgba(235, 87, 87, 0.12)'
                            : 'rgba(94, 106, 210, 0.12)'
                          : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${isSelected ? (isError ? '#EB5757' : 'rgba(94, 106, 210, 0.5)') : 'transparent'}`,
                        borderLeft: `3px solid ${isError ? '#EB5757' : isSelected ? '#27AE60' : 'var(--text-faint)'}`,
                        opacity: isSelected ? 1 : 0.7,
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 6px',
                          cursor: 'pointer',
                          gap: 6,
                          userSelect: 'none',
                        }}
                        onClick={() => toggleLogSelection(log.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            onChange={() => {
                              toggleLogSelection(log.id);
                            }}
                            style={{ cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }}
                          />
                          <span
                            style={{
                              fontWeight: 700,
                              color: log.method === 'POST' ? '#F2994A' : log.method === 'GET' ? '#26B5CE' : '#A259FF',
                              fontSize: '10px',
                              fontFamily: 'monospace',
                              flexShrink: 0,
                            }}
                          >
                            {log.method}
                          </span>
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                              fontSize: '10.5px',
                              fontFamily: 'monospace',
                            }}
                            title={log.url}
                          >
                            {log.url.replace(/^https?:\/\/[^/]+/, '') || log.url}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                            {log.durationMs}ms
                          </span>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '10px',
                              fontFamily: 'monospace',
                              color: isError ? '#EB5757' : '#27AE60',
                            }}
                          >
                            {log.status === 0 ? 'FAIL' : log.status}
                          </span>
                          {hasPayload && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedPayloadId(isPayloadOpen ? null : log.id);
                              }}
                              style={{
                                background: isPayloadOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '1px 4px',
                                fontSize: '9px',
                                borderRadius: 3,
                              }}
                              title={isPayloadOpen ? 'Hide payload' : 'Preview payload'}
                            >
                              {isPayloadOpen ? '▲' : '{ }'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline expandable payload preview */}
                      {isPayloadOpen && (
                        <div
                          style={{
                            padding: '6px 8px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                            background: 'rgba(0, 0, 0, 0.25)',
                            fontSize: '10px',
                          }}
                        >
                          <div style={{ wordBreak: 'break-all', color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'monospace', fontSize: '9.5px' }}>
                            {log.url}
                          </div>
                          {log.error && (
                            <div style={{ color: '#EB5757', marginBottom: 4 }}>
                              <strong>Error:</strong> {log.error}
                            </div>
                          )}
                          {log.requestBody && (
                            <div style={{ marginBottom: 4 }}>
                              <span style={{ color: 'var(--text-tertiary)', fontSize: '9px', fontWeight: 600 }}>Payload:</span>
                              <pre style={{ margin: '2px 0', padding: 4, background: '#12141d', borderRadius: 4, maxHeight: 70, overflow: 'auto', fontSize: '9px', color: 'var(--text-secondary)' }}>
                                {log.requestBody}
                              </pre>
                            </div>
                          )}
                          {log.responseBody && (
                            <div>
                              <span style={{ color: 'var(--text-tertiary)', fontSize: '9px', fontWeight: 600 }}>Response:</span>
                              <pre style={{ margin: '2px 0', padding: 4, background: '#12141d', borderRadius: 4, maxHeight: 70, overflow: 'auto', fontSize: '9px', color: 'var(--text-secondary)' }}>
                                {log.responseBody}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: '1px dashed var(--border-color)',
                  }}
                >
                  <span style={{ fontSize: '9.5px', color: 'var(--text-tertiary)' }}>
                    Listening to fetch & XHR in real-time
                  </span>
                  <button
                    type="button"
                    onClick={handleClearNetworkLogs}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 4px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#EB5757')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    title="Clear current log buffer to record fresh requests"
                  >
                    <Trash2 size={10} />
                    <span>Clear all {networkLogs.length} logs</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Screenshot Section */}
        <div className="screenshot-section">
          <div className="screenshot-header">
            <label className="checkbox-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={includeScreenshot && screenshots.length > 0}
                onChange={(e) => setIncludeScreenshot(e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Attach Screenshots</span>
              {screenshots.length > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: 'rgba(94, 106, 210, 0.2)',
                    color: '#8B97FF',
                    fontWeight: 600,
                  }}
                >
                  {screenshots.length} {screenshots.length === 1 ? 'image' : 'images'}
                </span>
              )}
            </label>

            <div className="screenshot-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {activeScreenshot && (
                <button
                  type="button"
                  className="btn-micro-accent"
                  onClick={handleOpenAnnotator}
                  title="Annotate current screenshot with boxes, arrows, text"
                  disabled={isCapturing}
                >
                  <Edit3 size={11} />
                  <span>Annotate</span>
                </button>
              )}
              {activeScreenshot && (
                <button
                  type="button"
                  className="btn-micro"
                  onClick={() => captureScreenshot('replace')}
                  title="Retake active screenshot from current page view"
                  disabled={isCapturing}
                >
                  <RefreshCw size={11} className={isCapturing ? 'animate-spin' : ''} />
                  <span>Retake</span>
                </button>
              )}
              <button
                type="button"
                className="btn-micro-primary"
                onClick={() => captureScreenshot('add')}
                title="Capture another screenshot from current page and add to ticket"
                disabled={isCapturing}
              >
                <Plus size={12} />
                <span>Capture Again</span>
              </button>
            </div>
          </div>

          {/* Main preview box for active screenshot */}
          <div className="screenshot-preview-box" style={{ position: 'relative', height: 130 }}>
            {isCapturing ? (
              <div className="screenshot-loading">
                <div className="spinner" />
                <span>Capturing page...</span>
              </div>
            ) : activeScreenshot ? (
              <>
                <img
                  src={activeScreenshot.dataUrl}
                  alt={`Screenshot ${activeScreenshotIndex + 1}`}
                  className="screenshot-img"
                  onClick={handleOpenAnnotator}
                  style={{ cursor: 'pointer' }}
                  title="Click to annotate this screenshot"
                />

                {/* Top-right badges and delete button */}
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {activeScreenshot.isAnnotated && (
                    <div className="annotated-badge">✓ Annotated</div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeScreenshot(activeScreenshotIndex);
                    }}
                    title="Delete this screenshot"
                    style={{
                      background: 'rgba(20, 20, 25, 0.75)',
                      color: '#EB5757',
                      border: '1px solid rgba(235, 87, 87, 0.4)',
                      borderRadius: 3,
                      padding: '2px 5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* Bottom-left pill showing current index */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    left: 6,
                    background: 'rgba(12, 13, 18, 0.75)',
                    color: '#ffffff',
                    fontSize: '9.5px',
                    padding: '2px 6px',
                    borderRadius: 3,
                    fontWeight: 600,
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  Screenshot {activeScreenshotIndex + 1} of {screenshots.length}
                </div>
              </>
            ) : (
              <div className="screenshot-loading" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>No screenshot available</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => captureScreenshot('add')}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  <Camera size={12} />
                  <span>Capture Screenshot</span>
                </button>
              </div>
            )}
          </div>

          {/* Horizontal thumbnail selector strip */}
          {screenshots.length > 0 && (
            <div className="screenshot-thumbnails-strip">
              {screenshots.map((s, idx) => {
                const isActive = idx === activeScreenshotIndex;
                return (
                  <div
                    key={s.id}
                    className={`screenshot-thumb-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveScreenshotIndex(idx)}
                    title={`Screenshot ${idx + 1}${s.isAnnotated ? ' (Annotated)' : ''}`}
                  >
                    <img
                      src={s.dataUrl}
                      alt={`Thumbnail ${idx + 1}`}
                      className="screenshot-thumb-img"
                    />
                    <span className="screenshot-thumb-badge">#{idx + 1}</span>
                    {s.isAnnotated && <span className="screenshot-thumb-annotated">✓</span>}
                  </div>
                );
              })}

              <button
                type="button"
                className="screenshot-thumb-add"
                onClick={() => captureScreenshot('add')}
                disabled={isCapturing}
                title="Capture another screenshot and add to ticket"
              >
                <Plus size={13} color="var(--primary)" />
                <span style={{ fontSize: '8px', fontWeight: 600 }}>+ Add</span>
              </button>
            </div>
          )}
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
