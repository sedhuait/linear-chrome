// Mock Chrome Extension API for Unit Tests
const storageData: Record<string, unknown> = {};

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: (keys: string[] | string | Record<string, unknown> | null) => {
        return new Promise((resolve) => {
          if (keys === null || keys === undefined) {
            resolve({ ...storageData });
            return;
          }
          if (Array.isArray(keys)) {
            const res: Record<string, unknown> = {};
            for (const k of keys) {
              if (storageData[k] !== undefined) res[k] = storageData[k];
            }
            resolve(res);
            return;
          }
          if (typeof keys === 'string') {
            resolve({ [keys]: storageData[keys] });
            return;
          }
          resolve({ ...keys, ...storageData });
        });
      },
      set: (items: Record<string, unknown>) => {
        return new Promise<void>((resolve) => {
          Object.assign(storageData, items);
          resolve();
        });
      },
      remove: (keys: string | string[]) => {
        return new Promise<void>((resolve) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) {
            delete storageData[k];
          }
          resolve();
        });
      },
      clear: () => {
        return new Promise<void>((resolve) => {
          for (const k of Object.keys(storageData)) {
            delete storageData[k];
          }
          resolve();
        });
      },
    },
  },
  runtime: {
    lastError: null,
    sendMessage: () => Promise.resolve({ success: true }),
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
    },
  },
  tabs: {
    query: () => Promise.resolve([]),
    get: () => Promise.resolve({}),
    captureVisibleTab: () => {},
  },
};
