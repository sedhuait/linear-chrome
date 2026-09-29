import { LinearApiClient } from '../services/linear-api';
import { MappingEngine } from '../services/mapping-engine';
import { ExtensionSettings, StorageService } from '../services/storage';
import { CreatedIssue, LinearProject, LinearWorkspaceData } from '../types/linear';
import { MappingRule, MatchType, PageMetadata, TicketType } from '../types/mapping';

class PopupController {
  private linearClient: LinearApiClient | null = null;
  private workspace: LinearWorkspaceData | null = null;
  private pageMetadata: PageMetadata | null = null;
  private currentScreenshot: string | null = null;
  private isAnnotated = false;
  private currentTicketType: TicketType = 'Bug';
  private rules: MappingRule[] = [];
  private settings!: ExtensionSettings;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.settings = await StorageService.getSettings();
    this.rules = await StorageService.getMappingRules();

    this.initNavigation();
    this.initFormControls();
    this.initMappingsManager();
    this.initSettingsTab();
    this.initKeyboardShortcuts();

    await this.loadLinearConnection();
    await this.inspectActiveTab();
    await this.checkPendingAnnotation();
  }

  // --- NAVIGATION ---
  private initNavigation(): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.nav-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.tab;
        tabs.forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(targetId!)?.classList.add('active');
      });
    });

    document.getElementById('btn-goto-settings')?.addEventListener('click', () => {
      document.querySelector<HTMLButtonElement>('.nav-tab[data-tab="tab-settings"]')?.click();
    });
  }

  // --- CONNECTION & WORKSPACE ---
  private async loadLinearConnection(): Promise<void> {
    const apiKey = await StorageService.getApiKey();
    const userBadge = document.getElementById('user-badge');
    const warning = document.getElementById('api-key-warning');

    if (!apiKey) {
      userBadge?.classList.add('disconnected');
      warning?.classList.remove('hidden');
      return;
    }

    warning?.classList.add('hidden');
    this.linearClient = new LinearApiClient(apiKey);

    try {
      this.workspace = await this.linearClient.getWorkspaceData();
      userBadge?.classList.remove('disconnected');
      userBadge?.classList.add('connected');
      if (userBadge) userBadge.title = `Connected as ${this.workspace.viewer.name}`;

      this.populateTeamsAndProjects();
      this.updateConnectionStatusCard();
    } catch (err) {
      console.error('Failed to load workspace from Linear:', err);
      userBadge?.classList.add('disconnected');
      this.showToast('Linear connection error: ' + (err as Error).message);
    }
  }

  private populateTeamsAndProjects(): void {
    if (!this.workspace) return;

    const teamSelect = document.getElementById('select-team') as HTMLSelectElement;
    const ruleTeamSelect = document.getElementById('rule-team') as HTMLSelectElement;

    teamSelect.innerHTML = '<option value="">Select Team...</option>';
    ruleTeamSelect.innerHTML = '<option value="">Select Team...</option>';

    for (const team of this.workspace.teams) {
      const opt = document.createElement('option');
      opt.value = team.id;
      opt.textContent = `${team.name} (${team.key})`;
      teamSelect.appendChild(opt);

      const ruleOpt = opt.cloneNode(true) as HTMLOptionElement;
      ruleTeamSelect.appendChild(ruleOpt);
    }

    teamSelect.addEventListener('change', () => {
      this.onTeamSelected(teamSelect.value);
    });

    ruleTeamSelect.addEventListener('change', () => {
      this.populateProjectSelect(ruleTeamSelect.value, 'rule-project');
    });

    // Check project mapping after teams are loaded
    if (this.pageMetadata) {
      this.applySmartMapping();
    }
  }

  private onTeamSelected(teamId: string, preselectedProjectId?: string): void {
    this.populateProjectSelect(teamId, 'select-project', preselectedProjectId);
    this.updateLabelsForTeam(teamId);

    // Auto-cache selection for this domain
    if (this.pageMetadata && this.settings.rememberLastSelectedPerDomain && teamId) {
      StorageService.setDomainPref(this.pageMetadata.hostname, {
        teamId,
        projectId: preselectedProjectId || '',
        defaultType: this.currentTicketType,
      });
    }
  }

  private populateProjectSelect(
    teamId: string,
    selectElementId: string,
    selectedProjectId?: string
  ): void {
    const projectSelect = document.getElementById(selectElementId) as HTMLSelectElement;
    if (!projectSelect) return;

    projectSelect.innerHTML = '<option value="">(No Project)</option>';
    if (!teamId || !this.workspace) return;

    const team = this.workspace.teams.find((t) => t.id === teamId);
    const projects: LinearProject[] = team ? team.projects : this.workspace.projects;

    for (const proj of projects) {
      const opt = document.createElement('option');
      opt.value = proj.id;
      opt.textContent = proj.name;
      if (selectedProjectId && proj.id === selectedProjectId) {
        opt.selected = true;
      }
      projectSelect.appendChild(opt);
    }
  }

  private updateLabelsForTeam(teamId: string): void {
    const labelSelect = document.getElementById('select-label') as HTMLSelectElement;
    if (!labelSelect || !this.workspace) return;

    labelSelect.innerHTML = '<option value="">Auto by Type</option>';
    const team = this.workspace.teams.find((t) => t.id === teamId);
    if (!team) return;

    for (const label of team.labels) {
      const opt = document.createElement('option');
      opt.value = label.id;
      opt.textContent = label.name;
      labelSelect.appendChild(opt);
    }

    this.autoSelectLabelByType();
  }

  private autoSelectLabelByType(): void {
    const labelSelect = document.getElementById('select-label') as HTMLSelectElement;
    const teamSelect = document.getElementById('select-team') as HTMLSelectElement;
    if (!labelSelect || !this.workspace || !teamSelect.value) return;

    const team = this.workspace.teams.find((t) => t.id === teamSelect.value);
    if (!team) return;

    // Look for matching label name
    const targetLabelName = this.currentTicketType.toLowerCase();
    const matched = team.labels.find((l) => l.name.toLowerCase() === targetLabelName);

    if (matched) {
      labelSelect.value = matched.id;
    } else {
      labelSelect.value = '';
    }
  }

  // --- TAB & PAGE INSPECTION ---
  private async inspectActiveTab(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE_METADATA' });
      if (response && response.success) {
        this.pageMetadata = response.metadata as PageMetadata;
        this.updatePageInspectionUI();

        // Pre-fill Title with page title
        const titleInput = document.getElementById('input-title') as HTMLInputElement;
        if (!titleInput.value && this.pageMetadata.title) {
          titleInput.value = `[${this.currentTicketType}] ${this.pageMetadata.title}`;
        }

        // Apply mapping if workspace is ready
        if (this.workspace) {
          await this.applySmartMapping();
        }

        // Auto-capture screenshot if setting enabled
        if (this.settings.autoCaptureOnOpen) {
          await this.captureScreenshot();
        }
      }
    } catch (e) {
      console.warn('Could not inspect tab metadata:', e);
    }
  }

  private updatePageInspectionUI(): void {
    if (!this.pageMetadata) return;

    const hostElem = document.getElementById('current-hostname');
    const urlElem = document.getElementById('current-url');
    const titleElem = document.getElementById('current-title');
    const metasElem = document.getElementById('current-metas');

    if (hostElem) hostElem.textContent = this.pageMetadata.hostname;
    if (urlElem) urlElem.textContent = this.pageMetadata.url;
    if (titleElem) titleElem.textContent = this.pageMetadata.title;

    if (metasElem) {
      const metaEntries = Object.entries(this.pageMetadata.metaTags);
      if (metaEntries.length === 0) {
        metasElem.textContent = 'None detected';
      } else {
        metasElem.textContent = metaEntries
          .slice(0, 3)
          .map(([k, v]) => `${k}="${v}"`)
          .join(', ');
      }
    }
  }

  // --- SMART MAPPING ENGINE ---
  private async applySmartMapping(): Promise<void> {
    if (!this.pageMetadata || !this.workspace) return;

    const result = await MappingEngine.resolveProjectMapping(this.pageMetadata, this.rules);
    const badgeBar = document.getElementById('mapping-badge-bar');
    const badgeText = document.getElementById('mapping-badge-text');
    const btnSaveRule = document.getElementById('btn-save-as-rule');

    if (result.matched && result.rule) {
      const rule = result.rule;
      const team = this.workspace.teams.find((t) => t.id === rule.teamId);
      const teamSelect = document.getElementById('select-team') as HTMLSelectElement;

      if (team) {
        teamSelect.value = team.id;
        this.onTeamSelected(team.id, rule.projectId);

        if (rule.defaultType) {
          this.setTicketType(rule.defaultType);
        }

        const project = this.workspace.projects.find((p) => p.id === rule.projectId);
        const targetLabel = project ? `${team.name} / ${project.name}` : team.name;

        badgeBar?.classList.remove('hidden');
        if (badgeText) badgeText.textContent = `🎯 Auto-mapped: ${targetLabel} (${result.matchReason})`;
        btnSaveRule?.classList.add('hidden');
      }
    } else {
      // No mapping found
      badgeBar?.classList.remove('hidden');
      if (badgeText) badgeText.textContent = `🌐 Domain: ${this.pageMetadata.hostname} (No mapping)`;
      btnSaveRule?.classList.remove('hidden');
      btnSaveRule?.addEventListener('click', () => this.openRuleModalForCurrentPage());
    }
  }

  // --- SCREENSHOT & ANNOTATION ---
  private async captureScreenshot(): Promise<void> {
    const loadingElem = document.getElementById('screenshot-loading');
    const imgElem = document.getElementById('screenshot-preview-img') as HTMLImageElement;
    const badge = document.getElementById('annotated-badge');

    loadingElem?.classList.remove('hidden');
    imgElem?.classList.add('hidden');
    badge?.classList.add('hidden');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
      if (response && response.success && response.dataUrl) {
        this.currentScreenshot = response.dataUrl;
        this.isAnnotated = false;
        imgElem.src = response.dataUrl;
        imgElem.classList.remove('hidden');
        loadingElem?.classList.add('hidden');
      } else {
        throw new Error(response?.error || 'Screenshot capture failed');
      }
    } catch (err) {
      console.error(err);
      if (loadingElem) {
        loadingElem.innerHTML = `<span>Screenshot capture unavailable on this page</span>`;
      }
    }
  }

  private async checkPendingAnnotation(): Promise<void> {
    const data = await chrome.storage.local.get(['pending_screenshot', 'pending_screenshot_annotated']);
    if (data.pending_screenshot && data.pending_screenshot_annotated) {
      this.currentScreenshot = data.pending_screenshot;
      this.isAnnotated = true;

      const imgElem = document.getElementById('screenshot-preview-img') as HTMLImageElement;
      const loadingElem = document.getElementById('screenshot-loading');
      const badge = document.getElementById('annotated-badge');

      if (imgElem) {
        imgElem.src = this.currentScreenshot!;
        imgElem.classList.remove('hidden');
      }
      loadingElem?.classList.add('hidden');
      badge?.classList.remove('hidden');

      // Clear the temporary flag
      await chrome.storage.local.remove(['pending_screenshot_annotated']);
    }
  }

  private async openAnnotator(): Promise<void> {
    if (!this.currentScreenshot) {
      this.showToast('Capture a screenshot first.');
      return;
    }

    await chrome.storage.local.set({ temp_annotator_image: this.currentScreenshot });
    const annotatorUrl = chrome.runtime.getURL('src/annotator/annotator.html');
    await chrome.tabs.create({ url: annotatorUrl });
  }

  // --- FORM CONTROLS & SUBMISSION ---
  private initFormControls(): void {
    // Type pills
    document.querySelectorAll<HTMLButtonElement>('.type-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const type = pill.dataset.type as TicketType;
        this.setTicketType(type);
      });
    });

    // Reset template
    document.getElementById('btn-insert-template')?.addEventListener('click', () => {
      this.insertTemplate(this.currentTicketType, true);
    });

    // Screenshot buttons
    document.getElementById('btn-annotate')?.addEventListener('click', () => this.openAnnotator());
    document.getElementById('btn-retake')?.addEventListener('click', () => this.captureScreenshot());

    // Submit ticket
    const form = document.getElementById('ticket-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitTicket();
    });

    // Create another ticket
    document.getElementById('btn-create-another')?.addEventListener('click', () => {
      document.getElementById('success-screen')?.classList.add('hidden');
      document.getElementById('ticket-form')?.classList.remove('hidden');
      (document.getElementById('input-title') as HTMLInputElement).value = '';
      this.insertTemplate(this.currentTicketType, true);
      this.captureScreenshot();
    });

    // Initial template
    this.insertTemplate(this.currentTicketType, false);
  }

  private setTicketType(type: TicketType): void {
    this.currentTicketType = type;
    document.querySelectorAll('.type-pill').forEach((pill) => {
      pill.classList.toggle('active', (pill as HTMLElement).dataset.type === type);
    });

    // Update title prefix if present
    const titleInput = document.getElementById('input-title') as HTMLInputElement;
    if (titleInput.value.startsWith('[Bug]') || titleInput.value.startsWith('[Improvement]') || titleInput.value.startsWith('[Task]')) {
      titleInput.value = titleInput.value.replace(/^\[(Bug|Improvement|Task)\]/, `[${type}]`);
    }

    this.autoSelectLabelByType();
    this.insertTemplate(type, false);
  }

  private insertTemplate(type: TicketType, force: boolean): void {
    const desc = document.getElementById('input-description') as HTMLTextAreaElement;
    if (!desc) return;
    if (!force && desc.value.trim().length > 0) return;

    if (type === 'Bug') {
      desc.value = `### Steps to Reproduce\n1. \n\n### Observed Behavior\n\n### Expected Behavior\n`;
    } else if (type === 'Improvement') {
      desc.value = `### Current Experience\n\n### Proposed Improvement\n\n### Expected Impact\n`;
    } else {
      desc.value = `### Objective\n\n### Tasks\n- [ ] `;
    }
  }

  private async submitTicket(): Promise<void> {
    if (!this.linearClient) {
      this.showToast('Please set your Linear API key in Settings.');
      return;
    }

    const teamSelect = document.getElementById('select-team') as HTMLSelectElement;
    const projectSelect = document.getElementById('select-project') as HTMLSelectElement;
    const prioritySelect = document.getElementById('select-priority') as HTMLSelectElement;
    const labelSelect = document.getElementById('select-label') as HTMLSelectElement;
    const titleInput = document.getElementById('input-title') as HTMLInputElement;
    const descInput = document.getElementById('input-description') as HTMLTextAreaElement;
    const checkScreenshot = document.getElementById('check-include-screenshot') as HTMLInputElement;
    const submitBtn = document.getElementById('btn-submit') as HTMLButtonElement;

    const teamId = teamSelect.value;
    const title = titleInput.value.trim();

    if (!teamId || !title) {
      this.showToast('Team and Title are required.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Creating Ticket...';

    try {
      let finalDescription = descInput.value.trim();
      let uploadedAssetUrl = '';

      // 1. Upload screenshot if checked
      if (checkScreenshot.checked && this.currentScreenshot) {
        submitBtn.innerHTML = '<div class="spinner"></div> Uploading Screenshot...';
        const blob = await this.dataUrlToBlob(this.currentScreenshot);
        try {
          uploadedAssetUrl = await this.linearClient.uploadScreenshot(
            blob,
            this.isAnnotated ? 'annotated_screenshot.png' : 'screenshot.png'
          );
          finalDescription += `\n\n---\n### Screenshot\n![Page Screenshot](${uploadedAssetUrl})\n`;
        } catch (uploadErr) {
          console.warn('Screenshot upload error (continuing ticket creation):', uploadErr);
          this.showToast('Screenshot upload warning: ' + (uploadErr as Error).message);
        }
      }

      // 2. Append environment metadata if enabled
      if (this.settings.includeEnvInfo && this.pageMetadata) {
        finalDescription += `\n\n<details><summary><strong>Environment & Page Context</strong></summary>\n\n` +
          `- **URL:** [${this.pageMetadata.url}](${this.pageMetadata.url})\n` +
          `- **Page Title:** ${this.pageMetadata.title}\n` +
          `- **Viewport:** ${this.pageMetadata.viewport.width} × ${this.pageMetadata.viewport.height}\n` +
          `- **User Agent:** \`${this.pageMetadata.userAgent}\`\n` +
          `</details>`;
      }

      // 3. Create Issue
      submitBtn.innerHTML = '<div class="spinner"></div> Creating Linear Issue...';
      const labelIds = labelSelect.value ? [labelSelect.value] : [];

      const createdIssue = await this.linearClient.createIssue({
        teamId,
        title,
        description: finalDescription,
        projectId: projectSelect.value || undefined,
        priority: parseInt(prioritySelect.value, 10),
        labelIds: labelIds.length > 0 ? labelIds : undefined,
      });

      // 4. Attach screenshot asset as a Linear issue attachment if uploaded
      if (uploadedAssetUrl) {
        await this.linearClient.createAttachment(createdIssue.id, 'Page Screenshot', uploadedAssetUrl);
      }

      this.showSuccessScreen(createdIssue);
    } catch (err) {
      console.error('Ticket creation error:', err);
      this.showToast('Failed to create ticket: ' + (err as Error).message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span class="btn-text">Create Linear Ticket</span><span class="btn-shortcut">⌘↵</span>`;
    }
  }

  private showSuccessScreen(issue: CreatedIssue): void {
    document.getElementById('ticket-form')?.classList.add('hidden');
    const screen = document.getElementById('success-screen');
    screen?.classList.remove('hidden');

    const issueIdElem = document.getElementById('success-issue-id');
    const issueTitleElem = document.getElementById('success-issue-title');
    const openLinearBtn = document.getElementById('btn-open-linear') as HTMLAnchorElement;
    const copyLinkBtn = document.getElementById('btn-copy-link');

    if (issueIdElem) issueIdElem.textContent = issue.identifier;
    if (issueTitleElem) issueTitleElem.textContent = issue.title;
    if (openLinearBtn) openLinearBtn.href = issue.url;

    copyLinkBtn?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(issue.url);
      this.showToast('Copied ticket URL to clipboard!');
    });
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  // --- MAPPINGS MANAGER TAB ---
  private initMappingsManager(): void {
    this.renderRulesList();

    document.getElementById('btn-new-rule')?.addEventListener('click', () => {
      this.openRuleModal();
    });

    document.getElementById('btn-quick-map-current')?.addEventListener('click', () => {
      this.openRuleModalForCurrentPage();
    });

    document.getElementById('btn-cancel-rule')?.addEventListener('click', () => {
      document.getElementById('rule-modal')?.classList.add('hidden');
    });

    // Strategy select changes
    const matchTypeSelect = document.getElementById('rule-match-type') as HTMLSelectElement;
    matchTypeSelect?.addEventListener('change', () => {
      const isMeta = matchTypeSelect.value === 'meta_tag';
      document.getElementById('group-rule-meta')?.classList.toggle('hidden', !isMeta);
      document.getElementById('group-rule-pattern')?.classList.toggle('hidden', isMeta);
    });

    // Save Rule form
    const ruleForm = document.getElementById('rule-form') as HTMLFormElement;
    ruleForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveRuleFromModal();
    });

    // Export & Import
    document.getElementById('btn-export-rules')?.addEventListener('click', async () => {
      const json = await StorageService.exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linear-mappings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const fileInput = document.getElementById('file-import-rules') as HTMLInputElement;
    document.getElementById('btn-import-rules')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const res = await StorageService.importData(text);
        this.rules = await StorageService.getMappingRules();
        this.renderRulesList();
        this.showToast(`Imported ${res.ruleCount} rules successfully!`);
      } catch (err) {
        this.showToast('Import failed: ' + (err as Error).message);
      }
    });
  }

  private renderRulesList(): void {
    const list = document.getElementById('rules-list');
    const countElem = document.getElementById('rule-count');
    if (!list) return;

    if (countElem) countElem.textContent = this.rules.length.toString();

    if (this.rules.length === 0) {
      list.innerHTML = `<div class="empty-state">No custom mapping rules yet. Create one above!</div>`;
      return;
    }

    list.innerHTML = '';
    for (const rule of this.rules) {
      const team = this.workspace?.teams.find((t) => t.id === rule.teamId);
      const proj = this.workspace?.projects.find((p) => p.id === rule.projectId);
      const targetDesc = proj ? `${team?.name || rule.teamId} → ${proj.name}` : team?.name || rule.teamId;

      const patternDesc = rule.matchType === 'meta_tag'
        ? `<meta ${rule.metaKey}="${rule.metaValue}">`
        : `${rule.matchType}: ${rule.pattern}`;

      const item = document.createElement('div');
      item.className = 'rule-item';
      item.innerHTML = `
        <div class="rule-item-info">
          <span class="rule-item-name">${this.escapeHtml(rule.name)}</span>
          <span class="rule-item-desc">${this.escapeHtml(patternDesc)} → ${this.escapeHtml(targetDesc)}</span>
        </div>
        <div class="rule-item-actions">
          <button class="btn-icon-danger btn-delete-rule" data-id="${rule.id}" title="Delete Rule">🗑</button>
        </div>
      `;

      item.querySelector('.btn-delete-rule')?.addEventListener('click', async () => {
        await StorageService.deleteMappingRule(rule.id);
        this.rules = await StorageService.getMappingRules();
        this.renderRulesList();
        this.applySmartMapping();
      });

      list.appendChild(item);
    }
  }

  private openRuleModal(initial?: Partial<MappingRule>): void {
    const modal = document.getElementById('rule-modal');
    modal?.classList.remove('hidden');

    const nameInput = document.getElementById('rule-name') as HTMLInputElement;
    const typeSelect = document.getElementById('rule-match-type') as HTMLSelectElement;
    const patternInput = document.getElementById('rule-pattern') as HTMLInputElement;
    const metaKeyInput = document.getElementById('rule-meta-key') as HTMLInputElement;
    const metaValInput = document.getElementById('rule-meta-val') as HTMLInputElement;

    nameInput.value = initial?.name || '';
    typeSelect.value = initial?.matchType || 'domain';
    patternInput.value = initial?.pattern || '';
    metaKeyInput.value = initial?.metaKey || '';
    metaValInput.value = initial?.metaValue || '';

    typeSelect.dispatchEvent(new Event('change'));
  }

  private openRuleModalForCurrentPage(): void {
    if (!this.pageMetadata) return;

    // Check meta tags for best candidate
    const metaCandidates = ['application-name', 'project', 'og:site_name'];
    let foundMetaKey = '';
    let foundMetaVal = '';

    for (const key of metaCandidates) {
      if (this.pageMetadata.metaTags[key]) {
        foundMetaKey = key;
        foundMetaVal = this.pageMetadata.metaTags[key];
        break;
      }
    }

    if (foundMetaKey) {
      this.openRuleModal({
        name: `${this.pageMetadata.hostname} (${foundMetaVal})`,
        matchType: 'meta_tag',
        metaKey: foundMetaKey,
        metaValue: foundMetaVal,
      });
    } else {
      this.openRuleModal({
        name: this.pageMetadata.hostname,
        matchType: 'domain',
        pattern: this.pageMetadata.hostname,
      });
    }
  }

  private async saveRuleFromModal(): Promise<void> {
    const name = (document.getElementById('rule-name') as HTMLInputElement).value.trim();
    const matchType = (document.getElementById('rule-match-type') as HTMLSelectElement).value as MatchType;
    const pattern = (document.getElementById('rule-pattern') as HTMLInputElement).value.trim();
    const metaKey = (document.getElementById('rule-meta-key') as HTMLInputElement).value.trim();
    const metaValue = (document.getElementById('rule-meta-val') as HTMLInputElement).value.trim();
    const teamId = (document.getElementById('rule-team') as HTMLSelectElement).value;
    const projectId = (document.getElementById('rule-project') as HTMLSelectElement).value || undefined;

    if (!name || !teamId) {
      this.showToast('Rule Name and Team are required.');
      return;
    }

    await StorageService.addMappingRule({
      name,
      matchType,
      pattern,
      metaKey: matchType === 'meta_tag' ? metaKey : undefined,
      metaValue: matchType === 'meta_tag' ? metaValue : undefined,
      teamId,
      projectId,
    });

    this.rules = await StorageService.getMappingRules();
    this.renderRulesList();
    document.getElementById('rule-modal')?.classList.add('hidden');
    this.showToast('Mapping rule saved!');
    this.applySmartMapping();
  }

  // --- SETTINGS TAB ---
  private async initSettingsTab(): Promise<void> {
    const keyInput = document.getElementById('input-api-key') as HTMLInputElement;
    const currentKey = await StorageService.getApiKey();
    if (keyInput) keyInput.value = currentKey;

    // Toggle password visibility
    document.getElementById('btn-toggle-key-visibility')?.addEventListener('click', () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    });

    // Save key
    document.getElementById('btn-save-key')?.addEventListener('click', async () => {
      const key = keyInput.value.trim();
      await StorageService.setApiKey(key);
      this.showToast('API Key saved.');
      await this.loadLinearConnection();
    });

    // Verify key
    document.getElementById('btn-test-key')?.addEventListener('click', async () => {
      const key = keyInput.value.trim();
      if (!key) {
        this.showToast('Enter an API key first.');
        return;
      }

      const client = new LinearApiClient(key);
      try {
        const data = await client.getWorkspaceData();
        this.showToast(`Verified! Connected as ${data.viewer.name}`);
        this.workspace = data;
        this.updateConnectionStatusCard();
      } catch (err) {
        this.showToast('Verification failed: ' + (err as Error).message);
      }
    });

    // Checkbox preferences
    const prefAutoCapture = document.getElementById('pref-auto-capture') as HTMLInputElement;
    const prefIncludeEnv = document.getElementById('pref-include-env') as HTMLInputElement;
    const prefRememberDomain = document.getElementById('pref-remember-domain') as HTMLInputElement;

    prefAutoCapture.checked = this.settings.autoCaptureOnOpen;
    prefIncludeEnv.checked = this.settings.includeEnvInfo;
    prefRememberDomain.checked = this.settings.rememberLastSelectedPerDomain;

    const savePref = async () => {
      await StorageService.saveSettings({
        autoCaptureOnOpen: prefAutoCapture.checked,
        includeEnvInfo: prefIncludeEnv.checked,
        rememberLastSelectedPerDomain: prefRememberDomain.checked,
      });
      this.settings = await StorageService.getSettings();
    };

    prefAutoCapture.addEventListener('change', savePref);
    prefIncludeEnv.addEventListener('change', savePref);
    prefRememberDomain.addEventListener('change', savePref);
  }

  private updateConnectionStatusCard(): void {
    if (!this.workspace) return;
    const box = document.getElementById('connection-status-box');
    const avatar = document.getElementById('conn-avatar');
    const name = document.getElementById('conn-user-name');
    const email = document.getElementById('conn-user-email');
    const stats = document.getElementById('conn-stats');

    box?.classList.remove('hidden');
    if (avatar) avatar.textContent = this.workspace.viewer.name.charAt(0).toUpperCase();
    if (name) name.textContent = this.workspace.viewer.name;
    if (email) email.textContent = this.workspace.viewer.email;
    if (stats) {
      stats.textContent = `Teams: ${this.workspace.teams.length} | Projects: ${this.workspace.projects.length}`;
    }
  }

  // --- SHORTCUTS & HELPERS ---
  private initKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const activeTab = document.querySelector('.tab-pane.active')?.id;
        if (activeTab === 'tab-create') {
          e.preventDefault();
          this.submitTicket();
        }
      }
    });
  }

  private showToast(message: string): void {
    const toast = document.getElementById('popup-toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3500);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Instantiate on popup open
window.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
