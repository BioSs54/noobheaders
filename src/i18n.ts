/**
 * NoobHeaders - i18n Helper
 * Automatic language detection and translation
 */

/**
 * Get translated message
 */
export function getMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

/**
 * Translate all elements with data-i18n attribute
 */
export function translatePage(): void {
  // Set HTML lang attribute
  document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0];

  // Translate elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (!key) return;

    const message = getMessage(key);

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
      if (inputElement.placeholder) {
        inputElement.placeholder = message;
      } else {
        inputElement.value = message;
      }
    } else {
      element.textContent = message;
    }
  });

  // Translate elements with data-i18n-placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (!key) return;
    (element as HTMLInputElement).placeholder = getMessage(key);
  });

  // Translate elements with data-i18n-title attribute
  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const key = element.getAttribute('data-i18n-title');
    if (!key) return;
    (element as HTMLElement).title = getMessage(key);
  });

  // Translate elements with data-i18n-html attribute (for HTML content)
  document.querySelectorAll('[data-i18n-html]').forEach((element) => {
    const key = element.getAttribute('data-i18n-html');
    if (!key) return;
    element.innerHTML = getMessage(key);
  });
}

// Auto-translate on page load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', translatePage);
}
