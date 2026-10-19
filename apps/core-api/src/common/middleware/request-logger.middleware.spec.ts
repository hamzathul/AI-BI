import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestLogger } from './request-logger.middleware.js';

function createMocks(statusCode: number) {
  const listeners = new Map<string, () => void>();

  const request = {
    method: 'GET',
    originalUrl: '/api/health',
  } as unknown as Request;

  const response = {
    statusCode,
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
    }),
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { request, response, next, listeners };
}

describe('requestLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a successful request after the response finishes', () => {
    const { request, response, next, listeners } = createMocks(200);

    requestLogger(request, response, next);
    expect(next).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    listeners.get('finish')?.();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^GET \/api\/health 200 \d+ms$/),
    );
  });

  it('logs 4xx responses at warn level', () => {
    const { request, response, next, listeners } = createMocks(404);

    requestLogger(request, response, next);
    listeners.get('finish')?.();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^GET \/api\/health 404 \d+ms$/),
    );
  });

  it('logs 5xx responses at error level', () => {
    const { request, response, next, listeners } = createMocks(500);

    requestLogger(request, response, next);
    listeners.get('finish')?.();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^GET \/api\/health 500 \d+ms$/),
    );
  });
});
