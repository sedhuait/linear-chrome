import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import { MappingEngine } from '../src/services/mapping-engine';
import { MappingRule, PageMetadata } from '../src/types/mapping';
import { StorageService } from '../src/services/storage';

describe('MappingEngine', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  const createSamplePage = (overrides?: Partial<PageMetadata>): PageMetadata => ({
    url: 'https://app.easydp.internal/dashboard',
    origin: 'https://app.easydp.internal',
    hostname: 'app.easydp.internal',
    pathname: '/dashboard',
    title: 'EasyDP App - Dashboard',
    metaTags: {
      'application-name': 'easydp-app',
      'project': 'EasyDP Frontend',
    },
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 Chrome',
    ...overrides,
  });

  it('matches by domain and resolves team and mapped label', async () => {
    const rules: MappingRule[] = [
      {
        id: 'rule_1',
        name: 'easydp-app',
        matchType: 'domain',
        pattern: 'app.easydp.internal',
        teamId: 'team_easydp',
        labelName: 'repo:app',
        createdAt: Date.now(),
      },
      {
        id: 'rule_2',
        name: 'easydp-api',
        matchType: 'domain',
        pattern: 'api.easydp.internal',
        teamId: 'team_easydp',
        labelName: 'repo:api',
        createdAt: Date.now(),
      },
    ];

    const page = createSamplePage();
    const result = await MappingEngine.resolveProjectMapping(page, rules);

    expect(result.matched).toBe(true);
    expect(result.rule?.name).toBe('easydp-app');
    expect(result.rule?.teamId).toBe('team_easydp');
    expect(result.rule?.labelName).toBe('repo:app');
  });

  it('matches subdomains when matching root domain pattern', async () => {
    const rules: MappingRule[] = [
      {
        id: 'rule_sub',
        name: 'Root EasyDP',
        matchType: 'domain',
        pattern: 'easydp.internal',
        teamId: 'team_easydp',
        labelName: 'repo:main',
        createdAt: Date.now(),
      },
    ];

    const page = createSamplePage({ hostname: 'staging.app.easydp.internal' });
    const result = await MappingEngine.resolveProjectMapping(page, rules);

    expect(result.matched).toBe(true);
    expect(result.rule?.teamId).toBe('team_easydp');
  });

  it('matches by URL prefix', async () => {
    const rules: MappingRule[] = [
      {
        id: 'rule_prefix',
        name: 'API Prefix Rule',
        matchType: 'url_prefix',
        pattern: 'https://site.com/api',
        teamId: 'team_api',
        labelName: 'repo:api',
        createdAt: Date.now(),
      },
    ];

    const matchPage = createSamplePage({ url: 'https://site.com/api/v1/users', hostname: 'site.com' });
    const matchResult = await MappingEngine.resolveProjectMapping(matchPage, rules);
    expect(matchResult.matched).toBe(true);
    expect(matchResult.rule?.labelName).toBe('repo:api');

    const nonMatchPage = createSamplePage({ url: 'https://site.com/web/home', hostname: 'site.com' });
    const nonMatchResult = await MappingEngine.resolveProjectMapping(nonMatchPage, rules);
    expect(nonMatchResult.matched).toBe(false);
  });

  it('matches by HTML <meta> tags', async () => {
    const rules: MappingRule[] = [
      {
        id: 'rule_meta',
        name: 'Meta Tag Matcher',
        matchType: 'meta_tag',
        pattern: 'easydp-api',
        metaKey: 'project',
        metaValue: 'backend-core',
        teamId: 'team_backend',
        labelName: 'repo:api',
        createdAt: Date.now(),
      },
    ];

    const page = createSamplePage({
      metaTags: { project: 'backend-core' },
    });

    const result = await MappingEngine.resolveProjectMapping(page, rules);
    expect(result.matched).toBe(true);
    expect(result.rule?.teamId).toBe('team_backend');
    expect(result.rule?.labelName).toBe('repo:api');
  });

  it('matches by page title keywords', async () => {
    const rules: MappingRule[] = [
      {
        id: 'rule_title',
        name: 'Title Keyword Matcher',
        matchType: 'title_contains',
        pattern: 'API Documentation',
        teamId: 'team_easydp',
        labelName: 'repo:api',
        createdAt: Date.now(),
      },
    ];

    const page = createSamplePage({ title: 'Swagger UI - API Documentation v2' });
    const result = await MappingEngine.resolveProjectMapping(page, rules);

    expect(result.matched).toBe(true);
    expect(result.rule?.labelName).toBe('repo:api');
  });

  it('falls back to cached domain preference with preserved label if no explicit rule matches', async () => {
    await StorageService.setDomainPref('portal.easydp.internal', {
      teamId: 'team_easydp',
      projectId: 'proj_portal',
      labelName: 'repo:app',
    });

    const page = createSamplePage({ hostname: 'portal.easydp.internal', url: 'https://portal.easydp.internal' });
    const result = await MappingEngine.resolveProjectMapping(page, []);

    expect(result.matched).toBe(true);
    expect(result.source).toBe('domain_cache');
    expect(result.rule?.teamId).toBe('team_easydp');
    expect(result.rule?.projectId).toBe('proj_portal');
    expect(result.rule?.labelName).toBe('repo:app');
  });
});
