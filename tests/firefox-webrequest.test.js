import assert from 'node:assert';
import { test } from 'node:test';
import { applyHeadersWebRequest } from '../dist/firefox-webrequest.js';

function createListenerSlot() {
  let currentListener = null;

  return {
    addListener(listener) {
      currentListener = listener;
    },
    removeListener(listener) {
      if (currentListener === listener) {
        currentListener = null;
      }
    },
    hasListener(listener) {
      return currentListener === listener;
    },
    getListener() {
      return currentListener;
    },
  };
}

function installFirefoxMock() {
  const onBeforeSendHeaders = createListenerSlot();
  const onHeadersReceived = createListenerSlot();

  globalThis.browser = {
    runtime: {},
    webRequest: {
      onBeforeSendHeaders,
      onHeadersReceived,
    },
  };

  return { onBeforeSendHeaders, onHeadersReceived };
}

test('applyHeadersWebRequest registers and modifies request headers in Firefox path', () => {
  const { onBeforeSendHeaders } = installFirefoxMock();
  const profiles = [
    {
      id: 'demo',
      name: 'Firefox Demo',
      enabled: true,
      headers: [
        {
          enabled: true,
          type: 'request',
          name: 'X-Firefox-Request',
          value: 'request-ok',
        },
      ],
      filters: [{ enabled: true, type: 'url', value: '*://*.example.com/*' }],
    },
  ];

  applyHeadersWebRequest(profiles, true);

  const requestListener = onBeforeSendHeaders.getListener();
  assert.ok(requestListener, 'Firefox request listener should be registered');

  const result = requestListener({
    url: 'https://api.example.com/users',
    requestHeaders: [
      { name: 'X-Firefox-Request', value: 'old-value' },
      { name: 'Accept', value: 'application/json' },
    ],
  });

  assert.ok(result, 'Listener should return modified request headers');
  assert.deepStrictEqual(result.requestHeaders, [
    { name: 'Accept', value: 'application/json' },
    { name: 'X-Firefox-Request', value: 'request-ok' },
  ]);
});

test('applyHeadersWebRequest registers and modifies response headers in Firefox path', () => {
  const { onHeadersReceived } = installFirefoxMock();
  const profiles = [
    {
      id: 'demo',
      name: 'Firefox Demo',
      enabled: true,
      headers: [
        {
          enabled: true,
          type: 'response',
          name: 'X-Firefox-Response',
          value: 'response-ok',
        },
      ],
      filters: [{ enabled: true, type: 'url', value: '*://*.example.com/*' }],
    },
  ];

  applyHeadersWebRequest(profiles, true);

  const responseListener = onHeadersReceived.getListener();
  assert.ok(responseListener, 'Firefox response listener should be registered');

  const result = responseListener({
    url: 'https://api.example.com/users',
    responseHeaders: [
      { name: 'X-Firefox-Response', value: 'old-value' },
      { name: 'Content-Type', value: 'application/json' },
    ],
  });

  assert.ok(result, 'Listener should return modified response headers');
  assert.deepStrictEqual(result.responseHeaders, [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-Firefox-Response', value: 'response-ok' },
  ]);
});
