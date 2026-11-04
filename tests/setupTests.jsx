import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { deserialize, serialize } from 'node:v8';

// jsdom omits structuredClone; this test-only bridge clones the JSON schema data
// using Node's native structured serializer. Real browser proof uses its native API.
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (value) => deserialize(serialize(value));
}

if (typeof global.React === 'undefined') {
  global.React = React;
}

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = ReadableStream;
}

if (typeof global.WritableStream === 'undefined') {
  global.WritableStream = WritableStream;
}

if (typeof global.TransformStream === 'undefined') {
  global.TransformStream = TransformStream;
}

class MessagePortMock {
  constructor() {
    this.onmessage = null;
    this.peer = null;
    this.closed = false;
    this.listeners = new Set();
  }

  postMessage(data) {
    const peer = this.peer;
    if (this.closed || !peer || peer.closed) {
      return;
    }
    queueMicrotask(() => {
      if (peer.closed) {
        return;
      }
      const event = { data };
      peer.onmessage?.(event);
      peer.listeners.forEach((listener) => listener(event));
    });
  }

  start() {}

  close() {
    this.closed = true;
    this.onmessage = null;
    this.listeners.clear();
  }

  addEventListener(type, listener) {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type, listener) {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }
}

class MessageChannelMock {
  constructor() {
    this.port1 = new MessagePortMock();
    this.port2 = new MessagePortMock();
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

if (typeof globalThis.MessageChannel === 'undefined') {
  globalThis.MessageChannel = MessageChannelMock;
}

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock;
}

// uuid@14 expects a standards-compliant global crypto implementation.
const cryptoImpl = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : webcrypto;

if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value: cryptoImpl,
  });
}

if (typeof window !== 'undefined' && typeof window.crypto === 'undefined') {
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    writable: true,
    value: globalThis.crypto,
  });
}

if (!globalThis.crypto.getRandomValues) {
  Object.defineProperty(globalThis.crypto, 'getRandomValues', {
    configurable: true,
    writable: true,
    value: webcrypto.getRandomValues.bind(webcrypto),
  });
}

if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: webcrypto.randomUUID.bind(webcrypto),
  });
}

if (typeof window !== 'undefined' && window.localStorage) {
  Object.defineProperty(global, 'localStorage', {
    configurable: true,
    writable: true,
    value: window.localStorage,
  });
}

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: jest.fn(() => 'blob:mock-url'),
});

class Worker {
  constructor(stringUrl) {
    this.url = stringUrl;
    this.onmessage = () => {};
  }

  postMessage(msg) {
    this.onmessage(msg);
  }
}

window.Worker = Worker;

/* eslint-disable global-require */
if (typeof window !== 'undefined') {
  // ref: https://github.com/ant-design/ant-design/issues/18774
  if (!window.matchMedia) {
    Object.defineProperty(global.window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  }
}

const errorLog = console.error;
const shouldFailOnActWarning =
  process.env.CI === 'true' ||
  process.env.CI === '1' ||
  process.env.FAIL_ON_ACT_WARNING === 'true' ||
  process.env.FAIL_ON_ACT_WARNING === '1';

const actWarningRecords = [];
let actWarningsThisTest = 0;
let dataProcessingDateNowSpy;

beforeEach(() => {
  actWarningsThisTest = 0;
  const testPath = global.expect?.getState?.().testPath;
  if (testPath?.endsWith('/tests/unit/pages/DataProcessing/index.test.tsx')) {
    dataProcessingDateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-08-04T00:00:00Z'));
  }
});

afterEach(() => {
  cleanup();
  dataProcessingDateNowSpy?.mockRestore();
  dataProcessingDateNowSpy = undefined;
  jest.useRealTimers();

  if (!shouldFailOnActWarning || actWarningsThisTest === 0) {
    return;
  }

  const currentTestName = global.expect?.getState?.().currentTestName;
  const testLabel = currentTestName ? ` in "${currentTestName}"` : '';
  const countLabel =
    actWarningsThisTest === 1
      ? '1 React act(...) warning'
      : `${actWarningsThisTest} React act(...) warnings`;
  throw new Error(
    `${countLabel} detected${testLabel}. Fix the test by awaiting async UI updates (e.g. await userEvent interactions, await waitFor(...), or use findBy* queries).`,
  );
});

afterAll(() => {
  if (actWarningRecords.length === 0) {
    return;
  }

  const sampleLimit = 5;
  const samples = actWarningRecords
    .slice(0, sampleLimit)
    .map(({ testName, message }) => `- ${testName || '<unknown test>'}: ${message}`)
    .join('\n');

  errorLog(
    `\n[tests] React act(...) warnings ${shouldFailOnActWarning ? 'detected' : 'suppressed'}: ${
      actWarningRecords.length
    }\n${samples}${
      actWarningRecords.length > sampleLimit
        ? `\n- ... (${actWarningRecords.length - sampleLimit} more)`
        : ''
    }\nSet FAIL_ON_ACT_WARNING=1 to fail locally.\n`,
  );
});

Object.defineProperty(global.window.console, 'error', {
  writable: true,
  configurable: true,
  value: (...rest) => {
    const logStr = rest.map((item) => (typeof item === 'string' ? item : String(item))).join(' ');
    const isActWarning =
      logStr.includes('was not wrapped in act(...)') &&
      (logStr.includes('inside a test') || logStr.includes('not wrapped in act'));

    const shouldSuppressReactWarning =
      !isActWarning &&
      [
        'Warning: findDOMNode is deprecated',
        'Warning: Each child in a list should have a unique "key" prop.',
        'Warning: Cannot update a component',
      ].some((prefix) => logStr.startsWith(prefix));

    if (shouldSuppressReactWarning) {
      return;
    }

    if (isActWarning) {
      actWarningsThisTest += 1;

      const testName = global.expect?.getState?.().currentTestName;
      actWarningRecords.push({ testName, message: logStr });

      if (!shouldFailOnActWarning) {
        return;
      }
    }

    errorLog(...rest);
  },
});
