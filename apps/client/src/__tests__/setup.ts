import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn((query: unknown) => ({
    matches: false,
    media: query as string,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: class IntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: jest.fn(),
});

global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
