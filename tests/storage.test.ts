import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import { StorageService } from '../src/services/storage';

describe('StorageService', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  describe('API Key & Settings', () => {
    it('stores and retrieves linear API key', async () => {
      expect(await StorageService.getApiKey()).toBe('');
      await StorageService.setApiKey('lin_api_test123456');
      expect(await StorageService.getApiKey()).toBe('lin_api_test123456');
    });

    it('returns default settings and merges updates including displayMode', async () => {
      const defaults = await StorageService.getSettings();
      expect(defaults.autoCaptureOnOpen).toBe(true);
      expect(defaults.defaultTicketType).toBe('Bug');
      expect(defaults.displayMode).toBe('fixed');

      await StorageService.saveSettings({ defaultTicketType: 'Improvement', displayMode: 'floating' });
      const updated = await StorageService.getSettings();
      expect(updated.defaultTicketType).toBe('Improvement');
      expect(updated.autoCaptureOnOpen).toBe(true);
      expect(updated.displayMode).toBe('floating');
    });
  });

  describe('Mapping Rules & Project Mapping Table', () => {
    it('adds, updates, and deletes mapping rules with mapped labels', async () => {
      const rule = await StorageService.addMappingRule({
        name: 'easydp-api',
        matchType: 'domain',
        pattern: 'api.easydp.internal',
        teamId: 'team_easydp',
        labelName: 'repo:api',
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('easydp-api');
      expect(rule.labelName).toBe('repo:api');

      let rules = await StorageService.getMappingRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('easydp-api');

      // Update rule
      await StorageService.updateMappingRule(rule.id, {
        name: 'easydp-api-v2',
        labelName: 'repo:api-v2',
      });

      rules = await StorageService.getMappingRules();
      expect(rules[0].name).toBe('easydp-api-v2');
      expect(rules[0].labelName).toBe('repo:api-v2');

      // Delete rule
      await StorageService.deleteMappingRule(rule.id);
      rules = await StorageService.getMappingRules();
      expect(rules).toHaveLength(0);
    });

    it('exports and imports rules via JSON backup', async () => {
      await StorageService.addMappingRule({
        name: 'easydp-app',
        matchType: 'domain',
        pattern: 'app.easydp.internal',
        teamId: 'team_easydp',
        labelName: 'repo:app',
      });

      const jsonExport = await StorageService.exportAllData();
      expect(jsonExport).toContain('easydp-app');
      expect(jsonExport).toContain('repo:app');

      // Clear storage
      await chrome.storage.local.clear();
      expect(await StorageService.getMappingRules()).toHaveLength(0);

      // Re-import JSON
      const res = await StorageService.importData(jsonExport);
      expect(res.success).toBe(true);
      expect(res.ruleCount).toBe(1);

      const importedRules = await StorageService.getMappingRules();
      expect(importedRules[0].name).toBe('easydp-app');
      expect(importedRules[0].labelName).toBe('repo:app');
    });
  });

  describe('Drafts & History', () => {
    it('persists and clears ticket drafts including category & network flags', async () => {
      await StorageService.saveDraft({
        ticketType: 'Bug',
        teamId: 'team_1',
        projectId: 'proj_1',
        priority: 1,
        labelId: 'label_1',
        bugCategory: 'API',
        includeNetworkLogs: true,
        title: 'Draft Ticket',
        description: 'Draft notes',
        currentUrl: 'https://site.com',
        screenshot: null,
        isAnnotated: false,
        updatedAt: Date.now(),
      });

      const draft = await StorageService.getDraft();
      expect(draft?.title).toBe('Draft Ticket');
      expect(draft?.bugCategory).toBe('API');
      expect(draft?.includeNetworkLogs).toBe(true);

      await StorageService.clearDraft();
      expect(await StorageService.getDraft()).toBeNull();
    });

    it('saves created tickets to history and caps at 100 entries', async () => {
      for (let i = 1; i <= 105; i++) {
        await StorageService.savePastTicket({
          id: `ticket_${i}`,
          identifier: `EAS-${i}`,
          title: `Bug #${i}`,
          url: `https://linear.app/issue/EAS-${i}`,
          createdAt: Date.now() + i,
        });
      }

      const history = await StorageService.getPastTickets();
      expect(history).toHaveLength(100);
      expect(history[0].identifier).toBe('EAS-105');
    });
  });
});
