import { describe, it, expect } from 'vitest';
import {
  isLocalhost,
  extractHostname,
  isInternalBrowserUrl,
  normalizeDomainInput,
  isUrlAllowed,
  getAllowedDomains,
} from '../src/utils/domain';

describe('Domain & Whitelist Utilities', () => {
  describe('isLocalhost', () => {
    it('detects localhost and standard loopback IPs', () => {
      expect(isLocalhost('localhost')).toBe(true);
      expect(isLocalhost('localhost:3000')).toBe(true);
      expect(isLocalhost('127.0.0.1')).toBe(true);
      expect(isLocalhost('127.0.0.1:8080')).toBe(true);
      expect(isLocalhost('[::1]')).toBe(true);
      expect(isLocalhost('::1')).toBe(true);
      expect(isLocalhost('dev.localhost')).toBe(true);
      expect(isLocalhost('api.localhost:4000')).toBe(true);
    });

    it('rejects external websites', () => {
      expect(isLocalhost('example.com')).toBe(false);
      expect(isLocalhost('app.linear.app')).toBe(false);
      expect(isLocalhost('localhost.com')).toBe(false);
      expect(isLocalhost('')).toBe(false);
    });
  });

  describe('extractHostname', () => {
    it('extracts lowercased hostname from various URL formats', () => {
      expect(extractHostname('https://linear.app/issue/123')).toBe('linear.app');
      expect(extractHostname('http://localhost:5173/dashboard')).toBe('localhost');
      expect(extractHostname('http://APP.EasyDP.internal:8080/')).toBe('app.easydp.internal');
      expect(extractHostname('sub.domain.co.uk')).toBe('sub.domain.co.uk');
    });

    it('handles empty or malformed input safely', () => {
      expect(extractHostname('')).toBe('');
    });
  });

  describe('isInternalBrowserUrl', () => {
    it('identifies browser internal URLs', () => {
      expect(isInternalBrowserUrl('chrome://extensions')).toBe(true);
      expect(isInternalBrowserUrl('chrome-extension://abcdef/popup.html')).toBe(true);
      expect(isInternalBrowserUrl('about:blank')).toBe(true);
      expect(isInternalBrowserUrl('edge://settings')).toBe(true);
      expect(isInternalBrowserUrl('devtools://devtools')).toBe(true);
      expect(isInternalBrowserUrl('view-source:https://example.com')).toBe(true);
    });

    it('allows standard web URLs', () => {
      expect(isInternalBrowserUrl('http://localhost:3000')).toBe(false);
      expect(isInternalBrowserUrl('https://app.easydp.internal')).toBe(false);
      expect(isInternalBrowserUrl('https://github.com')).toBe(false);
    });
  });

  describe('normalizeDomainInput', () => {
    it('cleans up user domain inputs', () => {
      expect(normalizeDomainInput('https://app.easydp.internal/dashboard?x=1')).toBe('app.easydp.internal');
      expect(normalizeDomainInput('http://api.internal:8080/v1')).toBe('api.internal');
      expect(normalizeDomainInput('*.mycompany.com')).toBe('mycompany.com');
      expect(normalizeDomainInput('   MyCompany.COM/   ')).toBe('mycompany.com');
    });
  });

  describe('isUrlAllowed', () => {
    const whitelist = ['easydp.internal', 'staging.company.com'];

    it('always allows localhost regardless of whitelist contents', () => {
      expect(isUrlAllowed('http://localhost:3000', [])).toBe(true);
      expect(isUrlAllowed('http://127.0.0.1:8080', [])).toBe(true);
      expect(isUrlAllowed('https://app.localhost:4000', [])).toBe(true);
    });

    it('never allows internal browser pages', () => {
      expect(isUrlAllowed('chrome://extensions', ['chrome://extensions', '*'])).toBe(false);
      expect(isUrlAllowed('about:blank', ['about:blank'])).toBe(false);
    });

    it('allows whitelisted domains and their subdomains', () => {
      expect(isUrlAllowed('https://easydp.internal/login', whitelist)).toBe(true);
      expect(isUrlAllowed('https://app.easydp.internal/dashboard', whitelist)).toBe(true);
      expect(isUrlAllowed('https://api.v2.easydp.internal/graphql', whitelist)).toBe(true);
      expect(isUrlAllowed('https://staging.company.com', whitelist)).toBe(true);
    });

    it('blocks non-whitelisted domains', () => {
      expect(isUrlAllowed('https://google.com', whitelist)).toBe(false);
      expect(isUrlAllowed('https://facebook.com', whitelist)).toBe(false);
      expect(isUrlAllowed('https://mybank.com/account', whitelist)).toBe(false);
      expect(isUrlAllowed('https://company.com', whitelist)).toBe(false); // only staging.company.com was whitelisted
    });
  });

  describe('getAllowedDomains', () => {
    it('merges whitelisted domains with domains derived from project mapping rules', () => {
      const explicitWhitelist = ['localhost', '127.0.0.1'];
      const rules = [
        { pattern: 'app.qa.ezdp.in', matchType: 'domain' },
        { pattern: 'admin.qa.ezdp.in', matchType: 'domain' },
        { pattern: 'https://staging.internal:8080/dashboard', matchType: 'url_prefix' },
      ];

      const allowed = getAllowedDomains(explicitWhitelist, rules);
      expect(allowed).toContain('localhost');
      expect(allowed).toContain('127.0.0.1');
      expect(allowed).toContain('app.qa.ezdp.in');
      expect(allowed).toContain('admin.qa.ezdp.in');
      expect(allowed).toContain('staging.internal');

      // Now verify isUrlAllowed accepts URLs for these mapped domains
      expect(isUrlAllowed('https://app.qa.ezdp.in/affiliates', allowed)).toBe(true);
      expect(isUrlAllowed('https://admin.qa.ezdp.in/users', allowed)).toBe(true);
      expect(isUrlAllowed('https://unrelated.com', allowed)).toBe(false);
    });
  });
});
