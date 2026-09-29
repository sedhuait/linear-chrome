/**
 * Utility functions for domain checking, localhost detection, and whitelist authorization.
 */

export function isLocalhost(hostname: string): boolean {
  if (!hostname) return false;
  let clean = hostname.toLowerCase().trim();
  if (clean.startsWith('[') && clean.endsWith(']')) {
    clean = clean.slice(1, -1);
  } else if (clean.startsWith('[') && clean.includes(']:')) {
    clean = clean.slice(1, clean.indexOf(']:'));
  } else if (clean.includes(':') && clean.split(':').length === 2) {
    clean = clean.split(':')[0];
  }
  return (
    clean === 'localhost' ||
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean.endsWith('.localhost')
  );
}

export function extractHostname(urlStr: string): string {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.toLowerCase();
  } catch {
    // If not a full URL, try prepending https://
    try {
      const parsed = new URL('https://' + urlStr);
      return parsed.hostname.toLowerCase();
    } catch {
      return '';
    }
  }
}

export function isInternalBrowserUrl(urlStr: string): boolean {
  if (!urlStr) return true;
  const restrictedProtocols = [
    'chrome:',
    'chrome-extension:',
    'about:',
    'edge:',
    'devtools:',
    'brave:',
    'view-source:',
    'blob:',
    'data:',
  ];
  return restrictedProtocols.some((p) => urlStr.toLowerCase().startsWith(p));
}

export function normalizeDomainInput(input: string): string {
  if (!input) return '';
  let str = input.trim().toLowerCase();
  // Strip protocol
  str = str.replace(/^[a-zA-Z]+:\/\//, '');
  // Strip paths and query parameters
  str = str.split('/')[0];
  // Strip port
  str = str.split(':')[0];
  // Strip leading wildcard *.
  str = str.replace(/^\*\./, '');
  return str.trim();
}

/**
 * Checks if a given URL is allowed (either localhost or matching any whitelisted domain).
 */
export function isUrlAllowed(urlStr: string, allowedDomains: string[] = []): boolean {
  if (!urlStr) return false;
  if (isInternalBrowserUrl(urlStr)) return false;

  const hostname = extractHostname(urlStr);
  if (!hostname) return false;

  // Localhost is always allowed
  if (isLocalhost(hostname)) {
    return true;
  }

  // Check against allowed domains list
  return allowedDomains.some((d) => {
    const clean = normalizeDomainInput(d);
    if (!clean) return false;
    // Exact match or subdomain match
    return hostname === clean || hostname.endsWith('.' + clean);
  });
}

/**
 * Combines explicit whitelisted domains with domains derived from project mapping rules.
 * Any domain mapped to a Linear project is automatically considered authorized.
 */
export function getAllowedDomains(
  whitelistedDomains: string[] = [],
  rules: { pattern?: string; urlPattern?: string; matchType?: string }[] = []
): string[] {
  const domainSet = new Set<string>();

  whitelistedDomains.forEach((d) => {
    const clean = normalizeDomainInput(d);
    if (clean) domainSet.add(clean);
  });

  rules.forEach((r) => {
    if (r.pattern) {
      const clean = normalizeDomainInput(r.pattern);
      if (clean && (clean.includes('.') || isLocalhost(clean))) {
        domainSet.add(clean);
      }
    }
    if (r.urlPattern) {
      const clean = normalizeDomainInput(r.urlPattern);
      if (clean && (clean.includes('.') || isLocalhost(clean))) {
        domainSet.add(clean);
      }
    }
  });

  return Array.from(domainSet);
}
