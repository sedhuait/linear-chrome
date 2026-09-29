import { MappingRule, MatchResult, PageMetadata } from '../types/mapping';
import { StorageService } from './storage';

export class MappingEngine {
  /**
   * Matches current page metadata against all preserved rules.
   * If an explicit rule matches, it returns it with the reason.
   * Otherwise falls back to domain-level cached preference if available.
   */
  static async resolveProjectMapping(
    page: PageMetadata,
    rules?: MappingRule[]
  ): Promise<MatchResult> {
    const allRules = rules || (await StorageService.getMappingRules());

    // 1. Check explicit user rules
    for (const rule of allRules) {
      const match = this.testRule(rule, page);
      if (match.matched) {
        return {
          matched: true,
          rule,
          matchReason: match.reason,
          source: 'explicit_rule',
        };
      }
    }

    // 2. Check cached domain preference
    const domainPref = await StorageService.getDomainPref(page.hostname);
    if (domainPref) {
      const syntheticRule: MappingRule = {
        id: 'cached_' + page.hostname,
        name: `Remembered for ${page.hostname}`,
        matchType: 'domain',
        pattern: page.hostname,
        teamId: domainPref.teamId,
        projectId: domainPref.projectId,
        labelId: domainPref.labelId,
        labelName: domainPref.labelName,
        defaultType: domainPref.defaultType,
        createdAt: domainPref.updatedAt,
      };

      return {
        matched: true,
        rule: syntheticRule,
        matchReason: `Saved preference for domain ${page.hostname}`,
        source: 'domain_cache',
      };
    }

    return {
      matched: false,
      source: 'none',
    };
  }

  /**
   * Evaluates whether a single rule matches the given page metadata.
   */
  static testRule(
    rule: MappingRule,
    page: PageMetadata
  ): { matched: boolean; reason: string } {
    switch (rule.matchType) {
      case 'domain': {
        const pattern = rule.pattern.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
        const host = page.hostname.toLowerCase();
        if (host === pattern || host.endsWith('.' + pattern)) {
          return { matched: true, reason: `Domain match: ${host} ≈ ${pattern}` };
        }
        return { matched: false, reason: 'Domain does not match' };
      }

      case 'url_prefix': {
        const pattern = rule.pattern.trim();
        if (page.url.startsWith(pattern)) {
          return { matched: true, reason: `URL starts with: ${pattern}` };
        }
        return { matched: false, reason: 'URL prefix does not match' };
      }

      case 'url_regex': {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(page.url)) {
            return { matched: true, reason: `URL matches regex /${rule.pattern}/i` };
          }
        } catch {
          return { matched: false, reason: 'Invalid regular expression' };
        }
        return { matched: false, reason: 'URL does not match regex' };
      }

      case 'title_contains': {
        const pattern = rule.pattern.toLowerCase().trim();
        if (page.title.toLowerCase().includes(pattern)) {
          return { matched: true, reason: `Page title contains "${rule.pattern}"` };
        }
        return { matched: false, reason: 'Title does not contain pattern' };
      }

      case 'meta_tag': {
        const key = (rule.metaKey || '').toLowerCase().trim();
        const expectedValue = (rule.metaValue || '').toLowerCase().trim();

        if (!key) return { matched: false, reason: 'Missing meta tag key' };

        // Search meta tags case-insensitively
        for (const [metaName, metaContent] of Object.entries(page.metaTags)) {
          if (metaName.toLowerCase() === key) {
            if (!expectedValue || metaContent.toLowerCase().includes(expectedValue)) {
              return {
                matched: true,
                reason: `Meta <${key}> matches "${metaContent}"`,
              };
            }
          }
        }
        return { matched: false, reason: `Meta tag <${key}> not found or value mismatch` };
      }

      default:
        return { matched: false, reason: 'Unknown match type' };
    }
  }

  /**
   * Generates smart suggested mapping options for the current page.
   */
  static getSuggestedRules(page: PageMetadata): Array<Partial<MappingRule>> {
    const suggestions: Array<Partial<MappingRule>> = [
      {
        name: `Domain: ${page.hostname}`,
        matchType: 'domain',
        pattern: page.hostname,
      },
    ];

    // Check meta tags for suggestions
    for (const [key, value] of Object.entries(page.metaTags)) {
      if (['application-name', 'project', 'og:site_name', 'apple-mobile-web-app-title'].includes(key.toLowerCase())) {
        suggestions.push({
          name: `Meta: <${key}> = "${value}"`,
          matchType: 'meta_tag',
          metaKey: key,
          metaValue: value,
          pattern: value,
        });
      }
    }

    return suggestions;
  }
}
