# Contributing to NoobHeaders

First off, thank you for considering contributing to NoobHeaders! 🎉

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Guidelines](#coding-guidelines)
- [Commit Messages](#commit-messages)

## Code of Conduct

This project and everyone participating in it is governed by a simple rule: **Be respectful and constructive**.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and what you expected**
- **Include screenshots if relevant**
- **Specify your browser and OS**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List any alternatives you've considered**

### Pull Requests

We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`
2. Make your changes
3. If you've added code, add tests
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue the pull request

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 9+

### Setup Steps

1. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/noobheaders.git
   cd noobheaders
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Generate icons**:
   ```bash
   pnpm run icons
   ```

4. **Load extension in browser**:
   - Chrome: `chrome://extensions/` → Enable Developer mode → Load unpacked
   - Firefox: `about:debugging` → Load Temporary Add-on

### Development Workflow

```bash
# Run tests
pnpm test

# Lint code
pnpm run lint

# Format code
pnpm run format

# Run all checks
pnpm run check
```

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Ensure all tests pass**: `pnpm test`
4. **Ensure code is formatted**: `pnpm run format`
5. **Ensure code is linted**: `pnpm run lint`
6. **Update CHANGELOG.md** if it's a significant change
7. **Use conventional commits** (see below)

### PR Checklist

- [ ] Code follows the project's coding style
- [ ] Tests added/updated and passing
- [ ] Documentation updated
- [ ] CHANGELOG.md updated (if needed)
- [ ] Commits follow conventional commit format
- [ ] PR description clearly describes the changes

## Coding Guidelines

### JavaScript Style

- Use **modern ES6+ syntax**
- Use **async/await** for asynchronous code
- Use **const** and **let**, not **var**
- Use **template literals** for strings
- Add **JSDoc comments** for functions
- Keep functions **small and focused**
- Use **meaningful variable names**

### Example:

```javascript
/**
 * Convert profile to declarativeNetRequest rules
 * @param {Object} profile - Profile object
 * @param {number} ruleIdOffset - Starting rule ID
 * @returns {Array} Array of rules
 */
function convertProfileToRules(profile, ruleIdOffset = 1) {
  const rules = [];
  // Implementation...
  return rules;
}
```

### HTML/CSS Style

- Use **semantic HTML**
- Keep styles **modular and reusable**
- Use **CSS custom properties** for theming
- Follow **BEM naming** for complex components
- Ensure **accessibility** (ARIA labels, keyboard navigation)

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks

### Examples

```bash
feat(profiles): add profile duplication feature

Add ability to duplicate existing profiles with a single click.
Users can now quickly create variations of existing configurations.

Closes #123

fix(filters): correct domain filter matching

Domain filters were not matching subdomains correctly.
Updated regex to properly handle subdomain matching.

feat(ui): add dark mode support

BREAKING CHANGE: Theme CSS custom properties have been renamed
```

### Scope

Common scopes:
- `profiles` - Profile management
- `headers` - Header modification
- `filters` - Filter system
- `ui` - User interface
- `i18n` - Internationalization
- `ci` - CI/CD
- `docs` - Documentation

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
node --test tests/manifest.test.js
```

### Writing Tests

- Place tests in `tests/` directory
- Name test files with `.test.js` suffix
- Use Node.js built-in test runner
- Aim for >80% code coverage

Example test:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';

test('generateId creates unique IDs', () => {
  const id1 = generateId();
  const id2 = generateId();
  assert.notEqual(id1, id2);
});
```

## Documentation

- Update README.md for user-facing changes
- Update code comments for implementation changes
- Add JSDoc comments for new functions
- Update examples/ for new features

## Questions?

Feel free to open an issue with the `question` label!

---

Thank you for contributing to NoobHeaders! 🎓💜
