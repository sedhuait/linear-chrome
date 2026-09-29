import "./modulepreload-polyfill-DaKOjhqt.js";
class LinearApiClient {
  apiKey;
  endpoint = "https://api.linear.app/graphql";
  constructor(apiKey) {
    this.apiKey = apiKey.trim();
  }
  async fetchGraphQL(query, variables = {}) {
    if (!this.apiKey) {
      throw new Error("Linear API key is not configured. Please set your Personal API Key in settings.");
    }
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey
      },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Linear API HTTP error ${res.status}: ${errorText || res.statusText}`);
    }
    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      const msg = json.errors.map((e) => e.message).join(", ");
      throw new Error(`Linear GraphQL Error: ${msg}`);
    }
    return json.data;
  }
  async getWorkspaceData() {
    const query = `
      query GetWorkspaceData {
        viewer {
          id
          name
          email
          avatarUrl
        }
        teams {
          nodes {
            id
            name
            key
            color
            labels {
              nodes {
                id
                name
                color
              }
            }
            projects {
              nodes {
                id
                name
                state
                icon
                color
              }
            }
          }
        }
        projects {
          nodes {
            id
            name
            state
            icon
            color
            teams {
              nodes {
                id
              }
            }
          }
        }
      }
    `;
    const data = await this.fetchGraphQL(query);
    const allProjectsMap = /* @__PURE__ */ new Map();
    for (const p of data.projects.nodes) {
      allProjectsMap.set(p.id, {
        id: p.id,
        name: p.name,
        state: p.state,
        icon: p.icon,
        color: p.color,
        teamIds: p.teams.nodes.map((t) => t.id)
      });
    }
    const teams = data.teams.nodes.map((team) => {
      const teamProjects = Array.from(allProjectsMap.values()).filter(
        (p) => p.teamIds.includes(team.id) || team.projects.nodes.some((tp) => tp.id === p.id)
      );
      return {
        id: team.id,
        name: team.name,
        key: team.key,
        color: team.color,
        labels: team.labels.nodes,
        projects: teamProjects
      };
    });
    return {
      viewer: data.viewer,
      teams,
      projects: Array.from(allProjectsMap.values())
    };
  }
  async uploadScreenshot(blob, filename = "screenshot.png") {
    const mutation = `
      mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
        fileUpload(contentType: $contentType, filename: $filename, size: $size) {
          success
          uploadFile {
            id
            uploadUrl
            assetUrl
            headers {
              key
              value
            }
          }
        }
      }
    `;
    const response = await this.fetchGraphQL(mutation, {
      contentType: blob.type || "image/png",
      filename,
      size: blob.size
    });
    if (!response.fileUpload.success || !response.fileUpload.uploadFile) {
      throw new Error("Linear failed to generate upload URL for screenshot.");
    }
    const { uploadUrl, assetUrl, headers } = response.fileUpload.uploadFile;
    const headerRecord = {};
    if (Array.isArray(headers)) {
      for (const h of headers) {
        headerRecord[h.key] = h.value;
      }
    }
    if (!headerRecord["Content-Type"]) {
      headerRecord["Content-Type"] = blob.type || "image/png";
    }
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: headerRecord,
      body: blob
    });
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload screenshot to asset storage: HTTP ${uploadRes.status}`);
    }
    return assetUrl;
  }
  async createIssue(input) {
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            url
          }
        }
      }
    `;
    const response = await this.fetchGraphQL(mutation, { input });
    if (!response.issueCreate.success || !response.issueCreate.issue) {
      throw new Error("Failed to create Linear issue.");
    }
    return response.issueCreate.issue;
  }
  async createAttachment(issueId, title, url) {
    const mutation = `
      mutation CreateAttachment($input: AttachmentCreateInput!) {
        attachmentCreate(input: $input) {
          success
        }
      }
    `;
    try {
      await this.fetchGraphQL(mutation, {
        input: {
          issueId,
          title,
          url
        }
      });
    } catch (e) {
      console.warn("Linear attachment creation warning (non-fatal):", e);
    }
  }
}
const DEFAULT_SETTINGS = {
  includeScreenshotByDefault: true,
  includeEnvInfo: true,
  defaultTicketType: "Bug",
  autoCaptureOnOpen: true,
  rememberLastSelectedPerDomain: true
};
class StorageService {
  static async getApiKey() {
    const result = await chrome.storage.local.get(["linear_api_key"]);
    return result.linear_api_key || "";
  }
  static async setApiKey(apiKey) {
    await chrome.storage.local.set({ linear_api_key: apiKey.trim() });
  }
  static async getSettings() {
    const result = await chrome.storage.local.get(["linear_settings"]);
    return { ...DEFAULT_SETTINGS, ...result.linear_settings || {} };
  }
  static async saveSettings(settings) {
    const current = await this.getSettings();
    await chrome.storage.local.set({ linear_settings: { ...current, ...settings } });
  }
  static async getMappingRules() {
    const result = await chrome.storage.local.get(["linear_mapping_rules"]);
    return result.linear_mapping_rules || [];
  }
  static async saveMappingRules(rules) {
    await chrome.storage.local.set({ linear_mapping_rules: rules });
  }
  static async addMappingRule(rule) {
    const rules = await this.getMappingRules();
    const newRule = {
      ...rule,
      id: "rule_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      createdAt: Date.now()
    };
    rules.unshift(newRule);
    await this.saveMappingRules(rules);
    return newRule;
  }
  static async deleteMappingRule(id) {
    const rules = await this.getMappingRules();
    const filtered = rules.filter((r) => r.id !== id);
    await this.saveMappingRules(filtered);
  }
  static async updateMappingRule(id, updates) {
    const rules = await this.getMappingRules();
    const index = rules.findIndex((r) => r.id === id);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...updates };
      await this.saveMappingRules(rules);
    }
  }
  static async getDomainPref(hostname) {
    const result = await chrome.storage.local.get(["linear_domain_prefs"]);
    const prefs = result.linear_domain_prefs || {};
    return prefs[hostname] || null;
  }
  static async setDomainPref(hostname, pref) {
    const result = await chrome.storage.local.get(["linear_domain_prefs"]);
    const prefs = result.linear_domain_prefs || {};
    prefs[hostname] = {
      ...pref,
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ linear_domain_prefs: prefs });
  }
  static async exportAllData() {
    const rules = await this.getMappingRules();
    const settings = await this.getSettings();
    const result = await chrome.storage.local.get(["linear_domain_prefs"]);
    return JSON.stringify(
      {
        version: "1.0.0",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        settings,
        rules,
        domainPrefs: result.linear_domain_prefs || {}
      },
      null,
      2
    );
  }
  static async importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (Array.isArray(data.rules)) {
      await this.saveMappingRules(data.rules);
      if (data.settings) await this.saveSettings(data.settings);
      if (data.domainPrefs) await chrome.storage.local.set({ linear_domain_prefs: data.domainPrefs });
      return { success: true, ruleCount: data.rules.length };
    }
    throw new Error("Invalid backup format: rules array missing");
  }
}
class MappingEngine {
  /**
   * Matches current page metadata against all preserved rules.
   * If an explicit rule matches, it returns it with the reason.
   * Otherwise falls back to domain-level cached preference if available.
   */
  static async resolveProjectMapping(page, rules) {
    const allRules = rules || await StorageService.getMappingRules();
    for (const rule of allRules) {
      const match = this.testRule(rule, page);
      if (match.matched) {
        return {
          matched: true,
          rule,
          matchReason: match.reason,
          source: "explicit_rule"
        };
      }
    }
    const domainPref = await StorageService.getDomainPref(page.hostname);
    if (domainPref) {
      const syntheticRule = {
        id: "cached_" + page.hostname,
        name: `Remembered for ${page.hostname}`,
        matchType: "domain",
        pattern: page.hostname,
        teamId: domainPref.teamId,
        projectId: domainPref.projectId,
        defaultType: domainPref.defaultType,
        createdAt: domainPref.updatedAt
      };
      return {
        matched: true,
        rule: syntheticRule,
        matchReason: `Saved preference for domain ${page.hostname}`,
        source: "domain_cache"
      };
    }
    return {
      matched: false,
      source: "none"
    };
  }
  /**
   * Evaluates whether a single rule matches the given page metadata.
   */
  static testRule(rule, page) {
    switch (rule.matchType) {
      case "domain": {
        const pattern = rule.pattern.toLowerCase().trim().replace(/^https?:\/\//, "").split("/")[0];
        const host = page.hostname.toLowerCase();
        if (host === pattern || host.endsWith("." + pattern)) {
          return { matched: true, reason: `Domain match: ${host} ≈ ${pattern}` };
        }
        return { matched: false, reason: "Domain does not match" };
      }
      case "url_prefix": {
        const pattern = rule.pattern.trim();
        if (page.url.startsWith(pattern)) {
          return { matched: true, reason: `URL starts with: ${pattern}` };
        }
        return { matched: false, reason: "URL prefix does not match" };
      }
      case "url_regex": {
        try {
          const regex = new RegExp(rule.pattern, "i");
          if (regex.test(page.url)) {
            return { matched: true, reason: `URL matches regex /${rule.pattern}/i` };
          }
        } catch {
          return { matched: false, reason: "Invalid regular expression" };
        }
        return { matched: false, reason: "URL does not match regex" };
      }
      case "title_contains": {
        const pattern = rule.pattern.toLowerCase().trim();
        if (page.title.toLowerCase().includes(pattern)) {
          return { matched: true, reason: `Page title contains "${rule.pattern}"` };
        }
        return { matched: false, reason: "Title does not contain pattern" };
      }
      case "meta_tag": {
        const key = (rule.metaKey || "").toLowerCase().trim();
        const expectedValue = (rule.metaValue || "").toLowerCase().trim();
        if (!key) return { matched: false, reason: "Missing meta tag key" };
        for (const [metaName, metaContent] of Object.entries(page.metaTags)) {
          if (metaName.toLowerCase() === key) {
            if (!expectedValue || metaContent.toLowerCase().includes(expectedValue)) {
              return {
                matched: true,
                reason: `Meta <${key}> matches "${metaContent}"`
              };
            }
          }
        }
        return { matched: false, reason: `Meta tag <${key}> not found or value mismatch` };
      }
      default:
        return { matched: false, reason: "Unknown match type" };
    }
  }
  /**
   * Generates smart suggested mapping options for the current page.
   */
  static getSuggestedRules(page) {
    const suggestions = [
      {
        name: `Domain: ${page.hostname}`,
        matchType: "domain",
        pattern: page.hostname
      }
    ];
    for (const [key, value] of Object.entries(page.metaTags)) {
      if (["application-name", "project", "og:site_name", "apple-mobile-web-app-title"].includes(key.toLowerCase())) {
        suggestions.push({
          name: `Meta: <${key}> = "${value}"`,
          matchType: "meta_tag",
          metaKey: key,
          metaValue: value,
          pattern: value
        });
      }
    }
    return suggestions;
  }
}
class PopupController {
  linearClient = null;
  workspace = null;
  pageMetadata = null;
  currentScreenshot = null;
  isAnnotated = false;
  currentTicketType = "Bug";
  rules = [];
  settings;
  constructor() {
    this.init();
  }
  async init() {
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
  initNavigation() {
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetId = tab.dataset.tab;
        tabs.forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(targetId)?.classList.add("active");
      });
    });
    document.getElementById("btn-goto-settings")?.addEventListener("click", () => {
      document.querySelector('.nav-tab[data-tab="tab-settings"]')?.click();
    });
  }
  // --- CONNECTION & WORKSPACE ---
  async loadLinearConnection() {
    const apiKey = await StorageService.getApiKey();
    const userBadge = document.getElementById("user-badge");
    const warning = document.getElementById("api-key-warning");
    if (!apiKey) {
      userBadge?.classList.add("disconnected");
      warning?.classList.remove("hidden");
      return;
    }
    warning?.classList.add("hidden");
    this.linearClient = new LinearApiClient(apiKey);
    try {
      this.workspace = await this.linearClient.getWorkspaceData();
      userBadge?.classList.remove("disconnected");
      userBadge?.classList.add("connected");
      if (userBadge) userBadge.title = `Connected as ${this.workspace.viewer.name}`;
      this.populateTeamsAndProjects();
      this.updateConnectionStatusCard();
    } catch (err) {
      console.error("Failed to load workspace from Linear:", err);
      userBadge?.classList.add("disconnected");
      this.showToast("Linear connection error: " + err.message);
    }
  }
  populateTeamsAndProjects() {
    if (!this.workspace) return;
    const teamSelect = document.getElementById("select-team");
    const ruleTeamSelect = document.getElementById("rule-team");
    teamSelect.innerHTML = '<option value="">Select Team...</option>';
    ruleTeamSelect.innerHTML = '<option value="">Select Team...</option>';
    for (const team of this.workspace.teams) {
      const opt = document.createElement("option");
      opt.value = team.id;
      opt.textContent = `${team.name} (${team.key})`;
      teamSelect.appendChild(opt);
      const ruleOpt = opt.cloneNode(true);
      ruleTeamSelect.appendChild(ruleOpt);
    }
    teamSelect.addEventListener("change", () => {
      this.onTeamSelected(teamSelect.value);
    });
    ruleTeamSelect.addEventListener("change", () => {
      this.populateProjectSelect(ruleTeamSelect.value, "rule-project");
    });
    if (this.pageMetadata) {
      this.applySmartMapping();
    }
  }
  onTeamSelected(teamId, preselectedProjectId) {
    this.populateProjectSelect(teamId, "select-project", preselectedProjectId);
    this.updateLabelsForTeam(teamId);
    if (this.pageMetadata && this.settings.rememberLastSelectedPerDomain && teamId) {
      StorageService.setDomainPref(this.pageMetadata.hostname, {
        teamId,
        projectId: preselectedProjectId || "",
        defaultType: this.currentTicketType
      });
    }
  }
  populateProjectSelect(teamId, selectElementId, selectedProjectId) {
    const projectSelect = document.getElementById(selectElementId);
    if (!projectSelect) return;
    projectSelect.innerHTML = '<option value="">(No Project)</option>';
    if (!teamId || !this.workspace) return;
    const team = this.workspace.teams.find((t) => t.id === teamId);
    const projects = team ? team.projects : this.workspace.projects;
    for (const proj of projects) {
      const opt = document.createElement("option");
      opt.value = proj.id;
      opt.textContent = proj.name;
      if (selectedProjectId && proj.id === selectedProjectId) {
        opt.selected = true;
      }
      projectSelect.appendChild(opt);
    }
  }
  updateLabelsForTeam(teamId) {
    const labelSelect = document.getElementById("select-label");
    if (!labelSelect || !this.workspace) return;
    labelSelect.innerHTML = '<option value="">Auto by Type</option>';
    const team = this.workspace.teams.find((t) => t.id === teamId);
    if (!team) return;
    for (const label of team.labels) {
      const opt = document.createElement("option");
      opt.value = label.id;
      opt.textContent = label.name;
      labelSelect.appendChild(opt);
    }
    this.autoSelectLabelByType();
  }
  autoSelectLabelByType() {
    const labelSelect = document.getElementById("select-label");
    const teamSelect = document.getElementById("select-team");
    if (!labelSelect || !this.workspace || !teamSelect.value) return;
    const team = this.workspace.teams.find((t) => t.id === teamSelect.value);
    if (!team) return;
    const targetLabelName = this.currentTicketType.toLowerCase();
    const matched = team.labels.find((l) => l.name.toLowerCase() === targetLabelName);
    if (matched) {
      labelSelect.value = matched.id;
    } else {
      labelSelect.value = "";
    }
  }
  // --- TAB & PAGE INSPECTION ---
  async inspectActiveTab() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "EXTRACT_PAGE_METADATA" });
      if (response && response.success) {
        this.pageMetadata = response.metadata;
        this.updatePageInspectionUI();
        const titleInput = document.getElementById("input-title");
        if (!titleInput.value && this.pageMetadata.title) {
          titleInput.value = `[${this.currentTicketType}] ${this.pageMetadata.title}`;
        }
        if (this.workspace) {
          await this.applySmartMapping();
        }
        if (this.settings.autoCaptureOnOpen) {
          await this.captureScreenshot();
        }
      }
    } catch (e) {
      console.warn("Could not inspect tab metadata:", e);
    }
  }
  updatePageInspectionUI() {
    if (!this.pageMetadata) return;
    const hostElem = document.getElementById("current-hostname");
    const urlElem = document.getElementById("current-url");
    const titleElem = document.getElementById("current-title");
    const metasElem = document.getElementById("current-metas");
    if (hostElem) hostElem.textContent = this.pageMetadata.hostname;
    if (urlElem) urlElem.textContent = this.pageMetadata.url;
    if (titleElem) titleElem.textContent = this.pageMetadata.title;
    if (metasElem) {
      const metaEntries = Object.entries(this.pageMetadata.metaTags);
      if (metaEntries.length === 0) {
        metasElem.textContent = "None detected";
      } else {
        metasElem.textContent = metaEntries.slice(0, 3).map(([k, v]) => `${k}="${v}"`).join(", ");
      }
    }
  }
  // --- SMART MAPPING ENGINE ---
  async applySmartMapping() {
    if (!this.pageMetadata || !this.workspace) return;
    const result = await MappingEngine.resolveProjectMapping(this.pageMetadata, this.rules);
    const badgeBar = document.getElementById("mapping-badge-bar");
    const badgeText = document.getElementById("mapping-badge-text");
    const btnSaveRule = document.getElementById("btn-save-as-rule");
    if (result.matched && result.rule) {
      const rule = result.rule;
      const team = this.workspace.teams.find((t) => t.id === rule.teamId);
      const teamSelect = document.getElementById("select-team");
      if (team) {
        teamSelect.value = team.id;
        this.onTeamSelected(team.id, rule.projectId);
        if (rule.defaultType) {
          this.setTicketType(rule.defaultType);
        }
        const project = this.workspace.projects.find((p) => p.id === rule.projectId);
        const targetLabel = project ? `${team.name} / ${project.name}` : team.name;
        badgeBar?.classList.remove("hidden");
        if (badgeText) badgeText.textContent = `🎯 Auto-mapped: ${targetLabel} (${result.matchReason})`;
        btnSaveRule?.classList.add("hidden");
      }
    } else {
      badgeBar?.classList.remove("hidden");
      if (badgeText) badgeText.textContent = `🌐 Domain: ${this.pageMetadata.hostname} (No mapping)`;
      btnSaveRule?.classList.remove("hidden");
      btnSaveRule?.addEventListener("click", () => this.openRuleModalForCurrentPage());
    }
  }
  // --- SCREENSHOT & ANNOTATION ---
  async captureScreenshot() {
    const loadingElem = document.getElementById("screenshot-loading");
    const imgElem = document.getElementById("screenshot-preview-img");
    const badge = document.getElementById("annotated-badge");
    loadingElem?.classList.remove("hidden");
    imgElem?.classList.add("hidden");
    badge?.classList.add("hidden");
    try {
      const response = await chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" });
      if (response && response.success && response.dataUrl) {
        this.currentScreenshot = response.dataUrl;
        this.isAnnotated = false;
        imgElem.src = response.dataUrl;
        imgElem.classList.remove("hidden");
        loadingElem?.classList.add("hidden");
      } else {
        throw new Error(response?.error || "Screenshot capture failed");
      }
    } catch (err) {
      console.error(err);
      if (loadingElem) {
        loadingElem.innerHTML = `<span>Screenshot capture unavailable on this page</span>`;
      }
    }
  }
  async checkPendingAnnotation() {
    const data = await chrome.storage.local.get(["pending_screenshot", "pending_screenshot_annotated"]);
    if (data.pending_screenshot && data.pending_screenshot_annotated) {
      this.currentScreenshot = data.pending_screenshot;
      this.isAnnotated = true;
      const imgElem = document.getElementById("screenshot-preview-img");
      const loadingElem = document.getElementById("screenshot-loading");
      const badge = document.getElementById("annotated-badge");
      if (imgElem) {
        imgElem.src = this.currentScreenshot;
        imgElem.classList.remove("hidden");
      }
      loadingElem?.classList.add("hidden");
      badge?.classList.remove("hidden");
      await chrome.storage.local.remove(["pending_screenshot_annotated"]);
    }
  }
  async openAnnotator() {
    if (!this.currentScreenshot) {
      this.showToast("Capture a screenshot first.");
      return;
    }
    await chrome.storage.local.set({ temp_annotator_image: this.currentScreenshot });
    const annotatorUrl = chrome.runtime.getURL("src/annotator/annotator.html");
    await chrome.tabs.create({ url: annotatorUrl });
  }
  // --- FORM CONTROLS & SUBMISSION ---
  initFormControls() {
    document.querySelectorAll(".type-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const type = pill.dataset.type;
        this.setTicketType(type);
      });
    });
    document.getElementById("btn-insert-template")?.addEventListener("click", () => {
      this.insertTemplate(this.currentTicketType, true);
    });
    document.getElementById("btn-annotate")?.addEventListener("click", () => this.openAnnotator());
    document.getElementById("btn-retake")?.addEventListener("click", () => this.captureScreenshot());
    const form = document.getElementById("ticket-form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitTicket();
    });
    document.getElementById("btn-create-another")?.addEventListener("click", () => {
      document.getElementById("success-screen")?.classList.add("hidden");
      document.getElementById("ticket-form")?.classList.remove("hidden");
      document.getElementById("input-title").value = "";
      this.insertTemplate(this.currentTicketType, true);
      this.captureScreenshot();
    });
    this.insertTemplate(this.currentTicketType, false);
  }
  setTicketType(type) {
    this.currentTicketType = type;
    document.querySelectorAll(".type-pill").forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.type === type);
    });
    const titleInput = document.getElementById("input-title");
    if (titleInput.value.startsWith("[Bug]") || titleInput.value.startsWith("[Improvement]") || titleInput.value.startsWith("[Task]")) {
      titleInput.value = titleInput.value.replace(/^\[(Bug|Improvement|Task)\]/, `[${type}]`);
    }
    this.autoSelectLabelByType();
    this.insertTemplate(type, false);
  }
  insertTemplate(type, force) {
    const desc = document.getElementById("input-description");
    if (!desc) return;
    if (!force && desc.value.trim().length > 0) return;
    if (type === "Bug") {
      desc.value = `### Steps to Reproduce
1. 

### Observed Behavior

### Expected Behavior
`;
    } else if (type === "Improvement") {
      desc.value = `### Current Experience

### Proposed Improvement

### Expected Impact
`;
    } else {
      desc.value = `### Objective

### Tasks
- [ ] `;
    }
  }
  async submitTicket() {
    if (!this.linearClient) {
      this.showToast("Please set your Linear API key in Settings.");
      return;
    }
    const teamSelect = document.getElementById("select-team");
    const projectSelect = document.getElementById("select-project");
    const prioritySelect = document.getElementById("select-priority");
    const labelSelect = document.getElementById("select-label");
    const titleInput = document.getElementById("input-title");
    const descInput = document.getElementById("input-description");
    const checkScreenshot = document.getElementById("check-include-screenshot");
    const submitBtn = document.getElementById("btn-submit");
    const teamId = teamSelect.value;
    const title = titleInput.value.trim();
    if (!teamId || !title) {
      this.showToast("Team and Title are required.");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Creating Ticket...';
    try {
      let finalDescription = descInput.value.trim();
      let uploadedAssetUrl = "";
      if (checkScreenshot.checked && this.currentScreenshot) {
        submitBtn.innerHTML = '<div class="spinner"></div> Uploading Screenshot...';
        const blob = await this.dataUrlToBlob(this.currentScreenshot);
        try {
          uploadedAssetUrl = await this.linearClient.uploadScreenshot(
            blob,
            this.isAnnotated ? "annotated_screenshot.png" : "screenshot.png"
          );
          finalDescription += `

---
### Screenshot
![Page Screenshot](${uploadedAssetUrl})
`;
        } catch (uploadErr) {
          console.warn("Screenshot upload error (continuing ticket creation):", uploadErr);
          this.showToast("Screenshot upload warning: " + uploadErr.message);
        }
      }
      if (this.settings.includeEnvInfo && this.pageMetadata) {
        finalDescription += `

<details><summary><strong>Environment & Page Context</strong></summary>

- **URL:** [${this.pageMetadata.url}](${this.pageMetadata.url})
- **Page Title:** ${this.pageMetadata.title}
- **Viewport:** ${this.pageMetadata.viewport.width} × ${this.pageMetadata.viewport.height}
- **User Agent:** \`${this.pageMetadata.userAgent}\`
</details>`;
      }
      submitBtn.innerHTML = '<div class="spinner"></div> Creating Linear Issue...';
      const labelIds = labelSelect.value ? [labelSelect.value] : [];
      const createdIssue = await this.linearClient.createIssue({
        teamId,
        title,
        description: finalDescription,
        projectId: projectSelect.value || void 0,
        priority: parseInt(prioritySelect.value, 10),
        labelIds: labelIds.length > 0 ? labelIds : void 0
      });
      if (uploadedAssetUrl) {
        await this.linearClient.createAttachment(createdIssue.id, "Page Screenshot", uploadedAssetUrl);
      }
      this.showSuccessScreen(createdIssue);
    } catch (err) {
      console.error("Ticket creation error:", err);
      this.showToast("Failed to create ticket: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span class="btn-text">Create Linear Ticket</span><span class="btn-shortcut">⌘↵</span>`;
    }
  }
  showSuccessScreen(issue) {
    document.getElementById("ticket-form")?.classList.add("hidden");
    const screen = document.getElementById("success-screen");
    screen?.classList.remove("hidden");
    const issueIdElem = document.getElementById("success-issue-id");
    const issueTitleElem = document.getElementById("success-issue-title");
    const openLinearBtn = document.getElementById("btn-open-linear");
    const copyLinkBtn = document.getElementById("btn-copy-link");
    if (issueIdElem) issueIdElem.textContent = issue.identifier;
    if (issueTitleElem) issueTitleElem.textContent = issue.title;
    if (openLinearBtn) openLinearBtn.href = issue.url;
    copyLinkBtn?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(issue.url);
      this.showToast("Copied ticket URL to clipboard!");
    });
  }
  async dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return await res.blob();
  }
  // --- MAPPINGS MANAGER TAB ---
  initMappingsManager() {
    this.renderRulesList();
    document.getElementById("btn-new-rule")?.addEventListener("click", () => {
      this.openRuleModal();
    });
    document.getElementById("btn-quick-map-current")?.addEventListener("click", () => {
      this.openRuleModalForCurrentPage();
    });
    document.getElementById("btn-cancel-rule")?.addEventListener("click", () => {
      document.getElementById("rule-modal")?.classList.add("hidden");
    });
    const matchTypeSelect = document.getElementById("rule-match-type");
    matchTypeSelect?.addEventListener("change", () => {
      const isMeta = matchTypeSelect.value === "meta_tag";
      document.getElementById("group-rule-meta")?.classList.toggle("hidden", !isMeta);
      document.getElementById("group-rule-pattern")?.classList.toggle("hidden", isMeta);
    });
    const ruleForm = document.getElementById("rule-form");
    ruleForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.saveRuleFromModal();
    });
    document.getElementById("btn-export-rules")?.addEventListener("click", async () => {
      const json = await StorageService.exportAllData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `linear-mappings-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    const fileInput = document.getElementById("file-import-rules");
    document.getElementById("btn-import-rules")?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const res = await StorageService.importData(text);
        this.rules = await StorageService.getMappingRules();
        this.renderRulesList();
        this.showToast(`Imported ${res.ruleCount} rules successfully!`);
      } catch (err) {
        this.showToast("Import failed: " + err.message);
      }
    });
  }
  renderRulesList() {
    const list = document.getElementById("rules-list");
    const countElem = document.getElementById("rule-count");
    if (!list) return;
    if (countElem) countElem.textContent = this.rules.length.toString();
    if (this.rules.length === 0) {
      list.innerHTML = `<div class="empty-state">No custom mapping rules yet. Create one above!</div>`;
      return;
    }
    list.innerHTML = "";
    for (const rule of this.rules) {
      const team = this.workspace?.teams.find((t) => t.id === rule.teamId);
      const proj = this.workspace?.projects.find((p) => p.id === rule.projectId);
      const targetDesc = proj ? `${team?.name || rule.teamId} → ${proj.name}` : team?.name || rule.teamId;
      const patternDesc = rule.matchType === "meta_tag" ? `<meta ${rule.metaKey}="${rule.metaValue}">` : `${rule.matchType}: ${rule.pattern}`;
      const item = document.createElement("div");
      item.className = "rule-item";
      item.innerHTML = `
        <div class="rule-item-info">
          <span class="rule-item-name">${this.escapeHtml(rule.name)}</span>
          <span class="rule-item-desc">${this.escapeHtml(patternDesc)} → ${this.escapeHtml(targetDesc)}</span>
        </div>
        <div class="rule-item-actions">
          <button class="btn-icon-danger btn-delete-rule" data-id="${rule.id}" title="Delete Rule">🗑</button>
        </div>
      `;
      item.querySelector(".btn-delete-rule")?.addEventListener("click", async () => {
        await StorageService.deleteMappingRule(rule.id);
        this.rules = await StorageService.getMappingRules();
        this.renderRulesList();
        this.applySmartMapping();
      });
      list.appendChild(item);
    }
  }
  openRuleModal(initial) {
    const modal = document.getElementById("rule-modal");
    modal?.classList.remove("hidden");
    const nameInput = document.getElementById("rule-name");
    const typeSelect = document.getElementById("rule-match-type");
    const patternInput = document.getElementById("rule-pattern");
    const metaKeyInput = document.getElementById("rule-meta-key");
    const metaValInput = document.getElementById("rule-meta-val");
    nameInput.value = initial?.name || "";
    typeSelect.value = initial?.matchType || "domain";
    patternInput.value = initial?.pattern || "";
    metaKeyInput.value = initial?.metaKey || "";
    metaValInput.value = initial?.metaValue || "";
    typeSelect.dispatchEvent(new Event("change"));
  }
  openRuleModalForCurrentPage() {
    if (!this.pageMetadata) return;
    const metaCandidates = ["application-name", "project", "og:site_name"];
    let foundMetaKey = "";
    let foundMetaVal = "";
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
        matchType: "meta_tag",
        metaKey: foundMetaKey,
        metaValue: foundMetaVal
      });
    } else {
      this.openRuleModal({
        name: this.pageMetadata.hostname,
        matchType: "domain",
        pattern: this.pageMetadata.hostname
      });
    }
  }
  async saveRuleFromModal() {
    const name = document.getElementById("rule-name").value.trim();
    const matchType = document.getElementById("rule-match-type").value;
    const pattern = document.getElementById("rule-pattern").value.trim();
    const metaKey = document.getElementById("rule-meta-key").value.trim();
    const metaValue = document.getElementById("rule-meta-val").value.trim();
    const teamId = document.getElementById("rule-team").value;
    const projectId = document.getElementById("rule-project").value || void 0;
    if (!name || !teamId) {
      this.showToast("Rule Name and Team are required.");
      return;
    }
    await StorageService.addMappingRule({
      name,
      matchType,
      pattern,
      metaKey: matchType === "meta_tag" ? metaKey : void 0,
      metaValue: matchType === "meta_tag" ? metaValue : void 0,
      teamId,
      projectId
    });
    this.rules = await StorageService.getMappingRules();
    this.renderRulesList();
    document.getElementById("rule-modal")?.classList.add("hidden");
    this.showToast("Mapping rule saved!");
    this.applySmartMapping();
  }
  // --- SETTINGS TAB ---
  async initSettingsTab() {
    const keyInput = document.getElementById("input-api-key");
    const currentKey = await StorageService.getApiKey();
    if (keyInput) keyInput.value = currentKey;
    document.getElementById("btn-toggle-key-visibility")?.addEventListener("click", () => {
      keyInput.type = keyInput.type === "password" ? "text" : "password";
    });
    document.getElementById("btn-save-key")?.addEventListener("click", async () => {
      const key = keyInput.value.trim();
      await StorageService.setApiKey(key);
      this.showToast("API Key saved.");
      await this.loadLinearConnection();
    });
    document.getElementById("btn-test-key")?.addEventListener("click", async () => {
      const key = keyInput.value.trim();
      if (!key) {
        this.showToast("Enter an API key first.");
        return;
      }
      const client = new LinearApiClient(key);
      try {
        const data = await client.getWorkspaceData();
        this.showToast(`Verified! Connected as ${data.viewer.name}`);
        this.workspace = data;
        this.updateConnectionStatusCard();
      } catch (err) {
        this.showToast("Verification failed: " + err.message);
      }
    });
    const prefAutoCapture = document.getElementById("pref-auto-capture");
    const prefIncludeEnv = document.getElementById("pref-include-env");
    const prefRememberDomain = document.getElementById("pref-remember-domain");
    prefAutoCapture.checked = this.settings.autoCaptureOnOpen;
    prefIncludeEnv.checked = this.settings.includeEnvInfo;
    prefRememberDomain.checked = this.settings.rememberLastSelectedPerDomain;
    const savePref = async () => {
      await StorageService.saveSettings({
        autoCaptureOnOpen: prefAutoCapture.checked,
        includeEnvInfo: prefIncludeEnv.checked,
        rememberLastSelectedPerDomain: prefRememberDomain.checked
      });
      this.settings = await StorageService.getSettings();
    };
    prefAutoCapture.addEventListener("change", savePref);
    prefIncludeEnv.addEventListener("change", savePref);
    prefRememberDomain.addEventListener("change", savePref);
  }
  updateConnectionStatusCard() {
    if (!this.workspace) return;
    const box = document.getElementById("connection-status-box");
    const avatar = document.getElementById("conn-avatar");
    const name = document.getElementById("conn-user-name");
    const email = document.getElementById("conn-user-email");
    const stats = document.getElementById("conn-stats");
    box?.classList.remove("hidden");
    if (avatar) avatar.textContent = this.workspace.viewer.name.charAt(0).toUpperCase();
    if (name) name.textContent = this.workspace.viewer.name;
    if (email) email.textContent = this.workspace.viewer.email;
    if (stats) {
      stats.textContent = `Teams: ${this.workspace.teams.length} | Projects: ${this.workspace.projects.length}`;
    }
  }
  // --- SHORTCUTS & HELPERS ---
  initKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const activeTab = document.querySelector(".tab-pane.active")?.id;
        if (activeTab === "tab-create") {
          e.preventDefault();
          this.submitTicket();
        }
      }
    });
  }
  showToast(message) {
    const toast = document.getElementById("popup-toast");
    if (toast) {
      toast.textContent = message;
      toast.classList.remove("hidden");
      setTimeout(() => toast.classList.add("hidden"), 3500);
    }
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
window.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
