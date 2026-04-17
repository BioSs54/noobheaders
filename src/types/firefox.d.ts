/**
 * TypeScript declarations for Firefox WebExtensions API
 * Minimal types to avoid conflicts with @types/chrome
 */

declare namespace browser {
  namespace runtime {
    interface OnInstalledDetails {
      reason: string;
      previousVersion?: string;
    }

    const onInstalled: {
      addListener(callback: (details: OnInstalledDetails) => void): void;
    };

    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: any,
          sendResponse: (response: any) => void
        ) => boolean | undefined
      ): void;
    };
  }

  namespace storage {
    interface StorageChange {
      oldValue?: any;
      newValue?: any;
    }

    namespace local {
      function get(keys: string | string[] | null): Promise<{ [key: string]: any }>;
      function set(items: { [key: string]: any }): Promise<void>;
      function remove(keys: string | string[]): Promise<void>;
      function clear(): Promise<void>;
      function getBytesInUse(keys?: string | string[] | null): Promise<number>;
    }

    const onChanged: {
      addListener(
        callback: (changes: { [key: string]: StorageChange }, areaName: string) => void
      ): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      active?: boolean;
    }

    function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;
    function create(createProperties: { url?: string }): Promise<Tab>;

    const onUpdated: {
      addListener(callback: (tabId: number, changeInfo: any, tab: Tab) => void): void;
    };

    const onActivated: {
      addListener(callback: (activeInfo: { tabId: number }) => void): void;
    };
  }

  namespace browserAction {
    function setBadgeText(details: { text: string }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  }

  namespace webRequest {
    interface HttpHeaders {
      name: string;
      value?: string;
      binaryValue?: number[];
    }

    interface BlockingResponse {
      requestHeaders?: HttpHeaders[];
      responseHeaders?: HttpHeaders[];
    }

    interface _OnBeforeSendRequestDetails {
      requestId: string;
      url: string;
      method: string;
      frameId: number;
      parentFrameId: number;
      requestHeaders?: HttpHeaders[];
      timeStamp: number;
      type: string;
    }

    interface _OnHeadersReceivedDetails {
      requestId: string;
      url: string;
      method: string;
      frameId: number;
      parentFrameId: number;
      responseHeaders?: HttpHeaders[];
      statusCode: number;
      statusLine: string;
      timeStamp: number;
      type: string;
    }

    const onBeforeSendHeaders: {
      addListener(
        callback: (details: _OnBeforeSendRequestDetails) => BlockingResponse | undefined,
        filter: { urls: string[] },
        extraInfoSpec?: string[]
      ): void;
      removeListener(
        callback: (details: _OnBeforeSendRequestDetails) => BlockingResponse | undefined
      ): void;
      hasListener(
        callback: (details: _OnBeforeSendRequestDetails) => BlockingResponse | undefined
      ): boolean;
    };

    const onHeadersReceived: {
      addListener(
        callback: (details: _OnHeadersReceivedDetails) => BlockingResponse | undefined,
        filter: { urls: string[] },
        extraInfoSpec?: string[]
      ): void;
      removeListener(
        callback: (details: _OnHeadersReceivedDetails) => BlockingResponse | undefined
      ): void;
      hasListener(
        callback: (details: _OnHeadersReceivedDetails) => BlockingResponse | undefined
      ): boolean;
    };
  }
}

declare const browser: typeof browser;
