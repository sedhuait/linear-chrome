import { NetworkLogEntry } from '../types/network';

declare global {
  interface Window {
    __LINEAR_NETWORK_LOGS__?: NetworkLogEntry[];
    __LINEAR_INTERCEPTOR_INSTALLED__?: boolean;
    __LINEAR_CLEAR_NETWORK_LOGS__?: () => void;
  }
}

(function () {
  if (window.__LINEAR_INTERCEPTOR_INSTALLED__) return;
  window.__LINEAR_INTERCEPTOR_INSTALLED__ = true;
  window.__LINEAR_NETWORK_LOGS__ = window.__LINEAR_NETWORK_LOGS__ || [];
  window.__LINEAR_CLEAR_NETWORK_LOGS__ = function () {
    if (Array.isArray(window.__LINEAR_NETWORK_LOGS__)) {
      window.__LINEAR_NETWORK_LOGS__.length = 0;
    } else {
      window.__LINEAR_NETWORK_LOGS__ = [];
    }
  };

  const MAX_LOGS = 30;
  const MAX_BODY_LENGTH = 3000;

  function truncate(str: string | undefined): string | undefined {
    if (!str) return undefined;
    if (str.length <= MAX_BODY_LENGTH) return str;
    return str.slice(0, MAX_BODY_LENGTH) + `... [truncated (${str.length} chars)]`;
  }

  function addLog(entry: NetworkLogEntry) {
    if (!Array.isArray(window.__LINEAR_NETWORK_LOGS__)) {
      window.__LINEAR_NETWORK_LOGS__ = [];
    }
    window.__LINEAR_NETWORK_LOGS__.unshift(entry);
    if (window.__LINEAR_NETWORK_LOGS__.length > MAX_LOGS) {
      window.__LINEAR_NETWORK_LOGS__.pop();
    }
    try {
      window.dispatchEvent(new CustomEvent('__linear_network_log__', { detail: entry }));
    } catch {
      // ignore
    }
  }

  // Intercept window.fetch
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const startTime = performance.now();
      const id = 'req_' + Math.random().toString(36).slice(2, 9);
      let url = '';
      let method = 'GET';
      let requestBody: string | undefined;

      try {
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input instanceof Request) {
          url = input.url;
          method = input.method;
        }

        if (init?.method) method = init.method.toUpperCase();
        if (init?.body) {
          if (typeof init.body === 'string') {
            requestBody = truncate(init.body);
          } else if (init.body instanceof FormData || init.body instanceof URLSearchParams) {
            requestBody = truncate(init.body.toString());
          }
        }
      } catch {
        // ignore
      }

      try {
        const response = await originalFetch.apply(this, [input, init]);
        const durationMs = Math.round(performance.now() - startTime);

        try {
          const clone = response.clone();
          const contentType = clone.headers.get('content-type') || '';
          if (
            contentType.includes('application/json') ||
            contentType.includes('text/') ||
            contentType.includes('application/xml') ||
            contentType.includes('text/plain')
          ) {
            clone
              .text()
              .then((bodyText) => {
                addLog({
                  id,
                  timestamp: Date.now(),
                  method,
                  url,
                  status: response.status,
                  durationMs,
                  requestBody,
                  responseBody: truncate(bodyText),
                });
              })
              .catch(() => {
                addLog({
                  id,
                  timestamp: Date.now(),
                  method,
                  url,
                  status: response.status,
                  durationMs,
                  requestBody,
                });
              });
          } else {
            addLog({
              id,
              timestamp: Date.now(),
              method,
              url,
              status: response.status,
              durationMs,
              requestBody,
              responseBody: `[Binary/Non-text content: ${contentType}]`,
            });
          }
        } catch {
          addLog({
            id,
            timestamp: Date.now(),
            method,
            url,
            status: response.status,
            durationMs,
            requestBody,
          });
        }

        return response;
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        addLog({
          id,
          timestamp: Date.now(),
          method,
          url,
          status: 0,
          durationMs,
          requestBody,
          error: (err as Error).message || 'Network request failed',
        });
        throw err;
      }
    };
  }

  // Intercept XMLHttpRequest
  if (typeof window.XMLHttpRequest === 'function') {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...rest: [boolean?, string?, string?]
    ) {
      (this as any)._linear_method = (method || 'GET').toUpperCase();
      (this as any)._linear_url = typeof url === 'string' ? url : url.toString();
      (this as any)._linear_startTime = performance.now();
      return (originalOpen as any).apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this;
      let requestBody: string | undefined;

      if (body) {
        if (typeof body === 'string') {
          requestBody = truncate(body);
        } else if (body instanceof FormData || body instanceof URLSearchParams) {
          requestBody = truncate(body.toString());
        }
      }

      const onComplete = (isError = false) => {
        try {
          const durationMs = Math.round(performance.now() - ((xhr as any)._linear_startTime || performance.now()));
          let responseBody: string | undefined;

          if (!isError && (xhr.responseType === '' || xhr.responseType === 'text')) {
            responseBody = truncate(xhr.responseText);
          } else if (xhr.responseType === 'json') {
            responseBody = truncate(JSON.stringify(xhr.response));
          }

          addLog({
            id: 'xhr_' + Math.random().toString(36).slice(2, 9),
            timestamp: Date.now(),
            method: (xhr as any)._linear_method || 'GET',
            url: (xhr as any)._linear_url || '',
            status: isError ? 0 : xhr.status,
            durationMs,
            requestBody,
            responseBody,
            error: isError ? 'XHR request failed' : undefined,
          });
        } catch {
          // ignore
        }
      };

      xhr.addEventListener('load', () => onComplete(false));
      xhr.addEventListener('error', () => onComplete(true));
      xhr.addEventListener('timeout', () => onComplete(true));

      return originalSend.apply(this, [body]);
    };
  }
})();
