# Linear Chrome Extension (Screenshot Capture & Smart Project Mapping)

A modern, high-performance Manifest V3 Chrome Extension built with **TypeScript**, **Vite**, and **Linear GraphQL API**. Capture page screenshots, annotate bugs/improvements, and auto-map Linear teams and projects based on URL patterns, domains, or page `<meta>` tags.

![Linear Chrome Extension](public/icons/icon.svg)

---

## Features

- **⚡ Fast Ticket Creation**: Create **Bug** 🐛, **Improvement** 💡, or **Task** 📋 tickets with auto-applied Linear labels.
- **📸 High-Resolution Screenshot Capture**: Automatically captures the active tab when opening the extension or on demand.
- **✏️ Interactive Visual Annotator**:
  - **Bounding Box** (`B`): Highlight buggy UI areas in red or accent colors.
  - **Pointer Arrow** (`A`): Direct attention to specific elements.
  - **Freehand Pen** (`P`): Circle or draw over UI issues.
  - **Redact / Blur** (`R`): Censor sensitive data, credentials, or customer PII before uploading!
  - **Text Callout** (`T`): Add custom notes and explanations.
  - **Undo / Clear / Color Picker**: Full editing workflow.
- **🎯 Smart Project & Team Mapping (Preserved)**:
  - Automatically identifies which Linear Team and Project belongs to the current page.
  - Supports multiple match strategies:
    - **Domain / Hostname**: e.g., `app.internal.com`, `github.com`
    - **URL Prefix**: e.g., `https://staging.site.com/admin`
    - **URL Regular Expression**: Custom advanced regex matching
    - **Page Title**: Keyword detection in document title
    - **HTML `<meta>` Tags**: Matches tags like `<meta name="application-name">`, `<meta property="og:site_name">`, or `<meta name="project">`
  - **Auto-Preservation**: Automatically remembers your team & project selections per domain so you never have to re-select them.
  - **Mappings Manager**: View, add, edit, test, delete, and import/export mapping rules as JSON.
- **📋 Rich Context & Environment Info**:
  - Automatically appends Page URL, Document Title, Viewport Dimensions, and Browser User Agent in an expandable Markdown section.
- **🔒 Local & Secure**:
  - Designed for local use.
  - Your Linear API key is stored securely in your browser's `chrome.storage.local` and never leaves your machine.

---

## Installation & Setup

### 1. Build the Extension
The extension is pre-built in the `dist/` directory. If you make any modifications, you can rebuild at any time:

```bash
npm install
npm run build
```

### 2. Load into Google Chrome
1. Open Google Chrome and navigate to:
   ```
   chrome://extensions
   ```
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the **`dist`** folder located inside this repository:
   ```
   /Users/sedhu/Work/linear-chrome/dist
   ```
5. The **Linear Ticket & Screenshot Creator** extension is now installed! Pin it to your Chrome toolbar for quick access.

---

## Getting Your Linear API Key

1. Log into your [Linear](https://linear.app) workspace.
2. Go to **Settings** → **Account** → **Security & Access** (or navigate directly to [linear.app/settings/api](https://linear.app/settings/api)).
3. Scroll to **Personal API keys** and click **New API key**.
4. Give it a label (e.g., `Chrome Extension`) and copy the generated key (`lin_api_...`).
5. In the Chrome extension, click the **Settings** tab.
6. Paste your key into the **Linear Personal API Key** field, click **Verify Connection**, and then **Save Key**.
7. Once verified, a green status dot appears and your teams/projects are loaded automatically.

---

## Usage Guide

### Creating a Ticket
1. Navigate to any webpage where you notice a bug or want to suggest an improvement.
2. Click the Linear extension icon on your Chrome toolbar.
3. The extension automatically:
   - Captures the current visible page tab.
   - Detects the URL and auto-selects the mapped Linear Team & Project.
   - Sets the default issue type (Bug or Improvement) with pre-filled markdown templates.
4. *(Optional)* Click **✏️ Annotate** on the screenshot preview to draw boxes, arrows, or redact sensitive text. Click **Save & Use** to attach the annotated image.
5. Fill in the **Title** and any extra notes in the **Description**.
6. Press **`Cmd + Enter`** (Mac) or click **Create Linear Ticket**.
7. Once created, click **Open in Linear ↗** or **Copy Link** to share.

---

### Project Mapping & Preservation
If your Linear workspace has multiple teams and projects across different microservices, internal dashboards, or client sites:

1. **Auto-Remembering**: Whenever you select a Team and Project for any domain, the extension preserves that selection for that domain automatically.
2. **Custom Rules**: Switch to the **Mappings** tab in the extension:
   - Click **+ Add Rule for this Site** to create a rule with one click.
   - Or click **+ New Rule** to define matching by **Domain**, **URL Prefix**, **Regex**, **Title Contains**, or **`<meta>` Tag**.
3. **Backup & Sharing**: Use the **Export JSON** and **Import JSON** buttons at the bottom of the Mappings tab to back up your rules or share them across devices.

---

## Development

```bash
# Watch mode (automatically rebuilds on code changes)
npm run dev

# Production build
npm run build
```

### Project Structure
```
linear-chrome/
├── dist/                      # Ready-to-load unpacked Chrome Extension
├── public/                    # Manifest V3 and icon assets
├── src/
│   ├── types/
│   │   ├── linear.ts          # Linear GraphQL models
│   │   └── mapping.ts         # Mapping schema & metadata types
│   ├── services/
│   │   ├── linear-api.ts      # GraphQL API client & file uploader
│   │   ├── mapping-engine.ts  # URL / Title / Meta pattern matcher
│   │   └── storage.ts         # Chrome storage wrapper
│   ├── popup/
│   │   ├── popup.html         # Main extension UI
│   │   ├── popup.css          # Linear dark theme styling
│   │   └── popup.ts           # Controller & submission handler
│   ├── annotator/
│   │   ├── annotator.html     # Screenshot annotation canvas
│   │   ├── annotator.css      # Annotator styles
│   │   └── annotator.ts       # Box, arrow, pen, redact, and text tools
│   └── background/
│       └── service-worker.ts  # Background capture & tab inspection
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```
