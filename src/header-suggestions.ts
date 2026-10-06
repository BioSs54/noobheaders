/**
 * Common header names suggested while typing a header name (native <datalist>)
 */

export const COMMON_REQUEST_HEADERS = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'DNT',
  'If-Modified-Since',
  'If-None-Match',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-Api-Key',
  'X-Correlation-Id',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Real-IP',
  'X-Request-Id',
  'X-Requested-With',
];

export const COMMON_RESPONSE_HEADERS = [
  'Access-Control-Allow-Credentials',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Origin',
  'Access-Control-Expose-Headers',
  'Cache-Control',
  'Content-Disposition',
  'Content-Security-Policy',
  'Content-Type',
  'Cross-Origin-Embedder-Policy',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy',
  'Location',
  'Permissions-Policy',
  'Referrer-Policy',
  'Set-Cookie',
  'Strict-Transport-Security',
  'Vary',
  'X-Content-Type-Options',
  'X-Frame-Options',
];

export const HEADER_SUGGESTION_LIST_IDS = {
  request: 'request-header-suggestions',
  response: 'response-header-suggestions',
} as const;

/**
 * Add the two suggestion lists to the document (once)
 */
export function installHeaderSuggestions(doc: Document = document): void {
  const lists: Array<[string, string[]]> = [
    [HEADER_SUGGESTION_LIST_IDS.request, COMMON_REQUEST_HEADERS],
    [HEADER_SUGGESTION_LIST_IDS.response, COMMON_RESPONSE_HEADERS],
  ];
  for (const [id, names] of lists) {
    if (doc.getElementById(id)) continue;
    const datalist = doc.createElement('datalist');
    datalist.id = id;
    for (const name of names) {
      const option = doc.createElement('option');
      option.value = name;
      datalist.appendChild(option);
    }
    doc.body.appendChild(datalist);
  }
}
