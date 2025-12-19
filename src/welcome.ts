// Welcome page script: move inline handlers to a module to satisfy CSP
// Opens the extension popup when the 'Get Started' button is clicked.

const btn = document.getElementById('get-started');
if (btn) {
  btn.addEventListener('click', () => {
    try {
      // In extension context, chrome.action.openPopup should be available
      // Guard it in case the page is opened outside the extension for tests.
      // @ts-ignore
      if (typeof chrome !== 'undefined' && chrome.action && chrome.action.openPopup) {
        // @ts-ignore
        chrome.action.openPopup();
      } else {
        // Fallback: try opening root page or show a hint in console
        console.warn('chrome.action.openPopup is not available in this context');
      }
    } catch (e) {
      // Swallow errors to avoid breaking the welcome page
      // eslint-disable-next-line no-console
      console.warn('Failed to open popup:', e);
    }
  });
}

export {};
