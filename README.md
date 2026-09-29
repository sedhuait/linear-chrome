# Linear Chrome Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

A modern, high-performance **Chrome Side Panel Extension** for [Linear](https://linear.app). Capture page screenshots, record network API requests & responses, annotate bugs, classify UI vs. API issues, and auto-map Linear teams and projects based on URL patterns, domains, or page `<meta>` tags.

Designed to dock permanently to the right side of your browser (like a crypto wallet or developer tool) with zero intrusive popups that close prematurely.

---

## ✨ Features

- **🪟 Fixed Native Side Panel**:
  - Docks neatly to the right side of Chrome using Chrome MV3's `sidePanel` API.
  - Doesn't close unexpectedly when clicking outside or inspecting DevTools.
  - Automatically syncs with active browser tab switches.

- **🌐 Network API Request & Response Interceptor**:
  - Non-intrusively captures real-time `fetch` and `XMLHttpRequest` traffic directly in the web page.
  - Records HTTP Method, URL, Status Code, Duration, Request Body, and Response Payload.
  - Smart status indicators (🟢 200, 🔴 4xx/5xx).
  - Automatically formats and attaches a collapsible network summary and payload details to your Linear ticket.

- **🏷️ UI vs. API Bug Classification**:
  - One-click **`🎨 UI`** and **`⚡ API`** toggle chips.
  - Automatically suggests the `API` tag if any captured network call failed on the active page.
  - Seamlessly creates or links `UI` and `API` labels in Linear with distinctive colors.
  - Quick toggles for `Engineering` and `Chrome Extension` tracking labels.

- **📸 High-Resolution Screenshot Capture & Inline Annotation**:
  - Automatically captures the active tab when opened or on demand.
  - Integrated in-panel annotator:
    - **Bounding Box** (`B`): Highlight UI bugs.
    - **Pointer Arrow** (`A`): Direct attention to specific elements.
    - **Freehand Pen** (`P`): Circle or draw over issues.
    - **Redact / Blur** (`R`): Censor sensitive data, credentials, or customer PII before uploading!
    - **Text Callout** (`T`): Add custom notes and explanations.

- **🎯 Smart Project & Team Mapping**:
  - Automatically detects which Linear Team and Project belongs to the current page.
  - Supports multiple match strategies:
    - **Domain / Hostname**: e.g., `app.internal.com`, `github.com`
    - **URL Prefix**: e.g., `https://staging.site.com/admin`
    - **URL Regular Expression**: Custom advanced regex matching
    - **Page Title**: Keyword detection in document title or visible `h1`
    - **HTML `<meta>` Tags**: Matches tags like `<meta name="application-name">`, `<meta property="og:site_name">`, or `<meta name="project">`
  - Remembers your team & project selections per domain so you never have to re-select them.
  - Import/Export mapping rules as JSON to share with teammates.

- **📜 Past Tickets History**:
  - Keeps a local log of all tickets created through the extension.
  - Instant one-click access to open the ticket in Linear or copy its URL.

- **🔒 Local & Privacy-First**:
  - Your Linear API key is stored securely in `chrome.storage.local` and never leaves your machine.
  - All communication is direct between your browser and the official Linear GraphQL API (`https://api.linear.app/graphql`).

---

## 🚀 Installation & Setup

### 1. Build the Extension
```bash
# Clone the repository
git clone https://github.com/sedhuait/linear-chrome.git
cd linear-chrome

# Install dependencies and build
npm install
npm run build
```

### 2. Load into Google Chrome
1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the **`dist`** folder inside the `linear-chrome` repository:
   ```text
   linear-chrome/dist
   ```
5. Pin the **Linear** icon to your Chrome toolbar. Clicking it opens the native Side Panel on the right!

---

## 🔑 Getting Your Linear API Key

1. Log into your [Linear](https://linear.app) workspace.
2. Go to **Settings** → **Account** → **Security & Access** (or navigate to [linear.app/settings/api](https://linear.app/settings/api)).
3. Under **Personal API keys**, click **New API key**.
4. Give it a name (e.g., `Chrome Extension`) and ensure the scope has write access.
5. In the extension Side Panel, click the **Settings** tab.
6. Paste your key (`lin_api_...`) and click **Save Key**. Your teams, projects, and labels load automatically.

---

## 🛠️ Tech Stack & Architecture

- **Platform**: Chrome Extensions Manifest V3 (`sidePanel`, `activeTab`, `scripting`, `storage`)
- **Frontend**: React 19, TypeScript, Lucide Icons, Modern CSS Variables
- **Build Tool**: Vite 6, Rollup
- **API**: Linear GraphQL API & Direct File Uploads

```
linear-chrome/
├── dist/                      # Packaged extension ready for Chrome
├── public/
│   ├── manifest.json          # Chrome MV3 manifest (side_panel enabled)
│   └── icons/                 # Extension icons
├── src/
│   ├── background/
│   │   └── service-worker.ts  # Background controller, tab sync & network bridge
│   ├── content/
│   │   └── interceptor.ts     # Main-world fetch/XHR network logger
│   ├── components/
│   │   ├── CreateTicketView.tsx # Ticket form, network inspector, label toggles
│   │   ├── InlineAnnotator.tsx  # Canvas drawing, boxes, arrows & redaction
│   │   ├── HistoryView.tsx      # Past created tickets history
│   │   ├── MappingsView.tsx     # Smart URL-to-project rule editor
│   │   └── SettingsView.tsx     # API key configuration & status
│   ├── services/
│   │   ├── linear-api.ts      # GraphQL API client & asset uploader
│   │   ├── mapping-engine.ts  # Matcher for domain, regex, meta tags
│   │   └── storage.ts         # Local storage persistence
│   └── types/
│       ├── linear.ts          # Linear GraphQL models
│       ├── mapping.ts         # Rule definition schemas
│       └── network.ts         # Intercepted request/response types
├── package.json
└── vite.config.ts
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/sedhuait/linear-chrome/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.
