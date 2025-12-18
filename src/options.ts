/**
 * NoobHeaders - Options Page
 */

interface OptionsData {
  autoEnable?: boolean;
  showBadge?: boolean;
}

async function loadOptions(): Promise<void> {
  const data = (await chrome.storage.local.get(['autoEnable', 'showBadge'])) as OptionsData;

  const autoEnableEl = document.getElementById('auto-enable') as HTMLInputElement;
  const showBadgeEl = document.getElementById('show-badge') as HTMLInputElement;

  if (autoEnableEl) {
    autoEnableEl.checked = data.autoEnable || false;
  }

  if (showBadgeEl) {
    showBadgeEl.checked = data.showBadge !== false;
  }
}

function setupListeners(): void {
  document.getElementById('auto-enable')?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ autoEnable: (e.target as HTMLInputElement).checked });
  });

  document.getElementById('show-badge')?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ showBadge: (e.target as HTMLInputElement).checked });
    await chrome.runtime.sendMessage({ action: 'updateBadge' });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadOptions();
  setupListeners();
});
