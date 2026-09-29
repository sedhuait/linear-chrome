function isLocalhost(hostname) {
  if (!hostname) return false;
  let clean = hostname.toLowerCase().trim();
  if (clean.startsWith("[") && clean.endsWith("]")) {
    clean = clean.slice(1, -1);
  } else if (clean.startsWith("[") && clean.includes("]:")) {
    clean = clean.slice(1, clean.indexOf("]:"));
  } else if (clean.includes(":") && clean.split(":").length === 2) {
    clean = clean.split(":")[0];
  }
  return clean === "localhost" || clean === "127.0.0.1" || clean === "::1" || clean.endsWith(".localhost");
}
function extractHostname(urlStr) {
  if (!urlStr) return "";
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.toLowerCase();
  } catch {
    try {
      const parsed = new URL("https://" + urlStr);
      return parsed.hostname.toLowerCase();
    } catch {
      return "";
    }
  }
}
function isInternalBrowserUrl(urlStr) {
  if (!urlStr) return true;
  const restrictedProtocols = [
    "chrome:",
    "chrome-extension:",
    "about:",
    "edge:",
    "devtools:",
    "brave:",
    "view-source:",
    "blob:",
    "data:"
  ];
  return restrictedProtocols.some((p) => urlStr.toLowerCase().startsWith(p));
}
function normalizeDomainInput(input) {
  if (!input) return "";
  let str = input.trim().toLowerCase();
  str = str.replace(/^[a-zA-Z]+:\/\//, "");
  str = str.split("/")[0];
  str = str.split(":")[0];
  str = str.replace(/^\*\./, "");
  return str.trim();
}
function isUrlAllowed(urlStr, allowedDomains = []) {
  if (!urlStr) return false;
  if (isInternalBrowserUrl(urlStr)) return false;
  const hostname = extractHostname(urlStr);
  if (!hostname) return false;
  if (isLocalhost(hostname)) {
    return true;
  }
  return allowedDomains.some((d) => {
    const clean = normalizeDomainInput(d);
    if (!clean) return false;
    return hostname === clean || hostname.endsWith("." + clean);
  });
}
export {
  isInternalBrowserUrl as a,
  extractHostname as e,
  isUrlAllowed as i,
  normalizeDomainInput as n
};
