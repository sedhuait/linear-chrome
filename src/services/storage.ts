import { MappingRule, TicketType } from '../types/mapping';
import { SavedTicket } from '../types/linear';

export interface DomainPref {
  teamId: string;
  projectId?: string;
  labelId?: string;
  labelName?: string;
  defaultType?: TicketType;
  updatedAt: number;
}

export interface ExtensionSettings {
  includeScreenshotByDefault: boolean;
  includeEnvInfo: boolean;
  defaultTicketType: TicketType;
  autoCaptureOnOpen: boolean;
  rememberLastSelectedPerDomain: boolean;
  displayMode: 'fixed' | 'floating';
  whitelistedDomains: string[];
}

export interface CapturedScreenshot {
  id: string;
  dataUrl: string;
  isAnnotated: boolean;
  createdAt: number;
}

export interface TicketDraft {
  ticketType: TicketType;
  teamId: string;
  projectId: string;
  priority: number;
  labelId: string;
  selectedLabelIds?: string[];
  isEngineering?: boolean;
  isChromeExtLabel?: boolean;
  bugCategory?: 'UI' | 'API' | null;
  includeNetworkLogs?: boolean;
  selectedNetworkLogIds?: string[];
  title: string;
  description: string;
  currentUrl: string;
  screenshot: string | null;
  screenshots?: CapturedScreenshot[];
  isAnnotated: boolean;
  updatedAt: number;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  includeScreenshotByDefault: true,
  includeEnvInfo: true,
  defaultTicketType: 'Bug',
  autoCaptureOnOpen: true,
  rememberLastSelectedPerDomain: true,
  displayMode: 'fixed',
  whitelistedDomains: ['localhost', '127.0.0.1'],
};

export class StorageService {
  static async getApiKey(): Promise<string> {
    const result = await chrome.storage.local.get(['linear_api_key']);
    return (result.linear_api_key as string) || '';
  }

  static async setApiKey(apiKey: string): Promise<void> {
    await chrome.storage.local.set({ linear_api_key: apiKey.trim() });
  }

  static async getSettings(): Promise<ExtensionSettings> {
    const result = await chrome.storage.local.get(['linear_settings']);
    const raw = result.linear_settings || {};
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      whitelistedDomains:
        Array.isArray(raw.whitelistedDomains) && raw.whitelistedDomains.length > 0
          ? raw.whitelistedDomains
          : DEFAULT_SETTINGS.whitelistedDomains,
    };
  }

  static async saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.getSettings();
    await chrome.storage.local.set({ linear_settings: { ...current, ...settings } });
  }

  static async addWhitelistedDomain(domain: string): Promise<string[]> {
    const settings = await this.getSettings();
    const current = settings.whitelistedDomains || ['localhost', '127.0.0.1'];
    const clean = domain.trim().toLowerCase();
    if (!clean || current.includes(clean)) return current;
    const updated = [...current, clean];
    await this.saveSettings({ whitelistedDomains: updated });
    return updated;
  }

  static async removeWhitelistedDomain(domain: string): Promise<string[]> {
    const settings = await this.getSettings();
    const current = settings.whitelistedDomains || ['localhost', '127.0.0.1'];
    const clean = domain.trim().toLowerCase();
    if (clean === 'localhost' || clean === '127.0.0.1') return current;
    const updated = current.filter((d) => d !== clean);
    await this.saveSettings({ whitelistedDomains: updated });
    return updated;
  }

  static async getMappingRules(): Promise<MappingRule[]> {
    const result = await chrome.storage.local.get(['linear_mapping_rules']);
    return (result.linear_mapping_rules as MappingRule[]) || [];
  }

  static async saveMappingRules(rules: MappingRule[]): Promise<void> {
    await chrome.storage.local.set({ linear_mapping_rules: rules });
  }

  static async addMappingRule(rule: Omit<MappingRule, 'id' | 'createdAt'>): Promise<MappingRule> {
    const rules = await this.getMappingRules();
    const newRule: MappingRule = {
      ...rule,
      id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      createdAt: Date.now(),
    };
    rules.unshift(newRule);
    await this.saveMappingRules(rules);
    return newRule;
  }

  static async deleteMappingRule(id: string): Promise<void> {
    const rules = await this.getMappingRules();
    const filtered = rules.filter(r => r.id !== id);
    await this.saveMappingRules(filtered);
  }

  static async updateMappingRule(id: string, updates: Partial<MappingRule>): Promise<void> {
    const rules = await this.getMappingRules();
    const index = rules.findIndex(r => r.id === id);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...updates };
      await this.saveMappingRules(rules);
    }
  }

  static async getDomainPref(hostname: string): Promise<DomainPref | null> {
    const result = await chrome.storage.local.get(['linear_domain_prefs']);
    const prefs = (result.linear_domain_prefs as Record<string, DomainPref>) || {};
    return prefs[hostname] || null;
  }

  static async setDomainPref(hostname: string, pref: Omit<DomainPref, 'updatedAt'>): Promise<void> {
    const result = await chrome.storage.local.get(['linear_domain_prefs']);
    const prefs = (result.linear_domain_prefs as Record<string, DomainPref>) || {};
    prefs[hostname] = {
      ...pref,
      updatedAt: Date.now(),
    };
    await chrome.storage.local.set({ linear_domain_prefs: prefs });
  }

  static async exportAllData(): Promise<string> {
    const rules = await this.getMappingRules();
    const settings = await this.getSettings();
    const result = await chrome.storage.local.get(['linear_domain_prefs']);
    return JSON.stringify(
      {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        settings,
        rules,
        domainPrefs: result.linear_domain_prefs || {},
      },
      null,
      2
    );
  }

  static async importData(jsonString: string): Promise<{ success: boolean; ruleCount: number }> {
    const data = JSON.parse(jsonString);
    if (Array.isArray(data.rules)) {
      await this.saveMappingRules(data.rules);
      if (data.settings) await this.saveSettings(data.settings);
      if (data.domainPrefs) await chrome.storage.local.set({ linear_domain_prefs: data.domainPrefs });
      return { success: true, ruleCount: data.rules.length };
    }
    throw new Error('Invalid backup format: rules array missing');
  }

  static async saveDraft(draft: TicketDraft): Promise<void> {
    await chrome.storage.local.set({ linear_ticket_draft: draft });
  }

  static async getDraft(): Promise<TicketDraft | null> {
    const res = await chrome.storage.local.get(['linear_ticket_draft']);
    return (res.linear_ticket_draft as TicketDraft) || null;
  }

  static async clearDraft(): Promise<void> {
    await chrome.storage.local.remove(['linear_ticket_draft', 'pending_screenshot', 'pending_screenshot_annotated']);
  }

  static async getPastTickets(): Promise<SavedTicket[]> {
    const res = await chrome.storage.local.get(['linear_past_tickets']);
    return (res.linear_past_tickets as SavedTicket[]) || [];
  }

  static async savePastTicket(ticket: SavedTicket): Promise<void> {
    const tickets = await this.getPastTickets();
    const filtered = tickets.filter((t) => t.id !== ticket.id && t.identifier !== ticket.identifier);
    filtered.unshift(ticket);
    const limited = filtered.slice(0, 100);
    await chrome.storage.local.set({ linear_past_tickets: limited });
  }

  static async deletePastTicket(id: string): Promise<void> {
    const tickets = await this.getPastTickets();
    const filtered = tickets.filter((t) => t.id !== id);
    await chrome.storage.local.set({ linear_past_tickets: filtered });
  }

  static async clearPastTickets(): Promise<void> {
    await chrome.storage.local.remove(['linear_past_tickets']);
  }
}
