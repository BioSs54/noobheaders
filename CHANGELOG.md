## [1.0.1](https://github.com/BioSs54/noobheaders/compare/v1.0.0...v1.0.1) (2025-12-19)


### Bug Fixes

* **i18n:** localize import/confirm prompts and load welcome i18n as module ([932533d](https://github.com/BioSs54/noobheaders/commit/932533df8838f665a4580e0e016db59a767290b9))

# 1.0.0 (2025-12-18)


### Features

* 🎉 initialize the NoobHeaders extension ([9c237a9](https://github.com/BioSs54/noobheaders/commit/9c237a9cd85ff0c858991d8697067bf69dfd22ed))

# Changelog

All notable changes to NoobHeaders will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release features
- Multiple profile support
- Request and response header modification
- URL and domain filters
- Import/Export functionality
- Clean, privacy-focused UI
- Multi-language support (EN, FR, ES)
- Welcome page for new users
- Options page
- Debug section with storage info

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A
- Fix: multiple URL filters now use OR semantics (generate one rule per URL filter) and rules moved to TypeScript (`src/rules.ts`).
 - Fix: welcome page now loads translations correctly (i18n loaded as module) and import/confirm/prompt strings are localized (EN/FR/ES).

### Security
- N/A

## [1.0.0] - TBD

### Added
- First stable release
- Core header modification functionality
- Profile management
- Filter system
- Import/Export
- Localization support
- CI/CD with GitHub Actions
- Automated releases with semantic-release

---

**Note**: This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and changelog generation.
