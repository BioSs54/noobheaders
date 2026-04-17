# NoobHeaders 🎓

[![CI](https://github.com/BioSs54/noobheaders/actions/workflows/ci.yml/badge.svg)](https://github.com/BioSs54/noobheaders/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> Simple, privacy-focused, local-first browser extension to modify HTTP headers. No ads, no tracking. Built for developers and noobs 🚀

## ✨ Features

- **🎯 Multiple Profiles**: Create and switch between different header configurations
- **🔧 Request & Response Headers**: Modify both request and response headers
- **🎨 Smart Filters**: Apply headers to specific URLs or domains
- **📦 Import/Export**: Share configurations or backup your profiles
- **🔒 Privacy First**: No ads, no tracking, no analytics. Your data stays on your device
- **🌍 Open Source**: Built in the open on GitHub
- **⚡ Lightweight**: Fast and efficient with minimal permissions
- **🎓 Noob Friendly**: Straightforward UI designed for developers and beginners

## 🚀 Installation

### Chrome Web Store
Available on the Chrome Web Store: [NoobHeaders — Chrome](https://chromewebstore.google.com/detail/noobheaders/djhidebmcofpbfcjfodfjhfjhmcpknkk)

### Firefox Add-ons
Available on Mozilla Add-ons: [NoobHeaders — Firefox](https://addons.mozilla.org/fr/firefox/addon/noobheaders/)

### Manual Installation

#### Download from Releases (recommended)

Download the packaged extensions from GitHub Releases (the **latest** link points to the most recent published release):

- **Chrome** (ZIP): [noobheaders-chrome.zip](https://github.com/BioSs54/noobheaders/releases/latest/download/noobheaders-chrome.zip)
- **Firefox** (ZIP): [noobheaders-firefox.zip](https://github.com/BioSs54/noobheaders/releases/latest/download/noobheaders-firefox.zip)

Installation

1. Unzip the downloaded archive.
2. Chrome: do not import the ZIP directly. Open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the unzipped folder.
3. Firefox: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and select the `manifest.json` file inside the unzipped folder.

> Tip: When available, prefer installing from the Chrome Web Store or Firefox Add-ons to receive automatic updates.

## 📖 Usage

### Creating Your First Profile

1. Click the extension icon in your toolbar
2. The default profile is already created
3. Click "Add Header" to add a new header
4. Configure:
   - **Type**: Request or Response
   - **Name**: Header name (e.g., `User-Agent`, `Access-Control-Allow-Origin`)
   - **Value**: Header value (or leave empty to remove the header)
5. Toggle the profile switch to enable it

### Using Filters

Filters allow you to apply headers only to specific requests:

- **URL Pattern**: Match URLs with wildcards (e.g., `*://example.com/*`)
- **Domain**: Match specific domains (e.g., `example.com`)

### Managing Profiles

- **Create**: Click the ➕ button next to the profile dropdown
- **Switch**: Select a profile from the dropdown
- **Rename**: Click "Rename" button
- **Duplicate**: Click "Duplicate" to copy the current profile
- **Delete**: Click the 🗑️ button (requires at least 2 profiles)

### Import/Export

- **Export**: Click "Export Profiles" to save all profiles as JSON
- **Import**: Click "Import Profiles" to load profiles from a JSON file

## 🛠️ Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+

### Project Structure

```
noobheaders/
├── src/                 # TypeScript source files
│   ├── types/          # Type definitions
│   │   └── index.ts    # Shared interfaces (Profile, Header, Filter)
│   ├── background.ts   # Service worker with type safety
│   ├── popup.ts        # Main UI logic
│   ├── options.ts      # Options page
│   └── i18n.ts         # Internationalization helper
├── dist/               # Compiled JavaScript (generated)
├── packages/           # Packaged extensions (generated)
├── icons/              # Extension icons
├── _locales/           # Translations (en, fr, es)
└── scripts/            # Build and package scripts
```

### Setup

```bash
# Install dependencies
pnpm install

# Build TypeScript to JavaScript
pnpm build

# Build in development mode (with sourcemaps)
pnpm build:dev

# Build and watch for changes
pnpm build:watch

# Generate icons
pnpm run icons

# Run tests
pnpm test

# Lint code
pnpm run lint

# Format code
pnpm run format

# Check everything (build + lint + tests)
pnpm run check

# Package for distribution
pnpm run package
```

### TypeScript Benefits

The project uses TypeScript for:
- **Type Safety**: Catch errors at compile time
- **Better IDE Support**: Autocomplete and inline documentation
- **Refactoring Confidence**: Safe rename and find references
- **Clear Interfaces**: Well-defined data structures
- **Fewer Runtime Bugs**: Static type checking prevents common mistakes

## 🧪 Testing

Run all tests:
```bash
pnpm test
```

Run E2E tests:
```bash
pnpm test:e2e
```

Run Chromium E2E only:
```bash
pnpm test:e2e:chromium
```

Run Firefox manual validation:
```bash
pnpm test:firefox
```

Tests include:
- Unit tests for core functionality
- Chromium E2E tests with Playwright
- Firefox manual validation through web-ext
- Manifest validation
- i18n completeness

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Quick Start

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run checks: `pnpm run check`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with help from [Claude AI](https://claude.ai) by Anthropic
- Inspired by ModHeader and other header modification extensions
- Icons generated using [Sharp](https://sharp.pixelplumbing.com/)

## 🔗 Links

- [GitHub Repository](https://github.com/BioSs54/noobheaders)
- [Issue Tracker](https://github.com/BioSs54/noobheaders/issues)
- [Changelog](CHANGELOG.md)
- [Contributing Guide](CONTRIBUTING.md)

---

Made with 💜 by [BioSs54](https://github.com/BioSs54) • No ads, no tracking, just headers 🎓
