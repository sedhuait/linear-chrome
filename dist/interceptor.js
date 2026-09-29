(function() {
  if (window.__LINEAR_INTERCEPTOR_INSTALLED__) return;
  window.__LINEAR_INTERCEPTOR_INSTALLED__ = true;
  window.__LINEAR_NETWORK_LOGS__ = window.__LINEAR_NETWORK_LOGS__ || [];
  const MAX_LOGS = 30;
  const MAX_BODY_LENGTH = 3e3;
  function truncate(str) {
    if (!str) return void 0;
    if (str.length <= MAX_BODY_LENGTH) return str;
    return str.slice(0, MAX_BODY_LENGTH) + `... [truncated (${str.length} chars)]`;
  }
  function addLog(entry) {
    if (!window.__LINEAR_NETWORK_LOGS__) window.__LINEAR_NETWORK_LOGS__ = [];
    window.__LINEAR_NETWORK_LOGS__.unshift(entry);
    if (window.__LINEAR_NETWORK_LOGS__.length > MAX_LOGS) {
      window.__LINEAR_NETWORK_LOGS__.pop();
    }
  }
  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
      const startTime = performance.now();
      const id = "req_" + Math.random().toString(36).slice(2, 9);
      let url = "";
      let method = "GET";
      let requestBody;
      try {
        if (typeof input === "string") {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input instanceof Request) {
          url = input.url;
          method = input.method;
        }
        if (init?.method) method = init.method.toUpperCase();
        if (init?.body) {
          if (typeof init.body === "string") {
            requestBody = truncate(init.body);
          } else if (init.body instanceof FormData || init.body instanceof URLSearchParams) {
            requestBody = truncate(init.body.toString());
          }
        }
      } catch {
      }
      try {
        const response = await originalFetch.apply(this, [input, init]);
        const durationMs = Math.round(performance.now() - startTime);
        try {
          const clone = response.clone();
          const contentType = clone.headers.get("content-type") || "";
          if (contentType.includes("application/json") || contentType.includes("text/") || contentType.includes("application/xml") || contentType.includes("text/plain")) {
            clone.text().then((bodyText) => {
              addLog({
                id,
                timestamp: Date.now(),
                method,
                url,
                status: response.status,
                durationMs,
                requestBody,
                responseBody: truncate(bodyText)
              });
            }).catch(() => {
              addLog({
                id,
                timestamp: Date.now(),
                method,
                url,
                status: response.status,
                durationMs,
                requestBody
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
              responseBody: `[Binary/Non-text content: ${contentType}]`
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
            requestBody
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
          error: err.message || "Network request failed"
        });
        throw err;
      }
    };
  }
  if (typeof window.XMLHttpRequest === "function") {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._linear_method = (method || "GET").toUpperCase();
      this._linear_url = typeof url === "string" ? url : url.toString();
      this._linear_startTime = performance.now();
      return originalOpen.apply(this, [method, url, ...rest]);
    };
    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      let requestBody;
      if (body) {
        if (typeof body === "string") {
          requestBody = truncate(body);
        } else if (body instanceof FormData || body instanceof URLSearchParams) {
          requestBody = truncate(body.toString());
        }
      }
      const onComplete = (isError = false) => {
        try {
          const durationMs = Math.round(performance.now() - (xhr._linear_startTime || performance.now()));
          let responseBody;
          if (!isError && (xhr.responseType === "" || xhr.responseType === "text")) {
            responseBody = truncate(xhr.responseText);
          } else if (xhr.responseType === "json") {
            responseBody = truncate(JSON.stringify(xhr.response));
          }
          addLog({
            id: "xhr_" + Math.random().toString(36).slice(2, 9),
            timestamp: Date.now(),
            method: xhr._linear_method || "GET",
            url: xhr._linear_url || "",
            status: isError ? 0 : xhr.status,
            durationMs,
            requestBody,
            responseBody,
            error: isError ? "XHR request failed" : void 0
          });
        } catch {
        }
      };
      xhr.addEventListener("load", () => onComplete(false));
      xhr.addEventListener("error", () => onComplete(true));
      xhr.addEventListener("timeout", () => onComplete(true));
      return originalSend.apply(this, [body]);
    };
  }
})();
