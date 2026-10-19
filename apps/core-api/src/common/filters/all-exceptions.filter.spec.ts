import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AllExceptionsFilter,
  type ApiErrorBody,
} from './all-exceptions.filter.js';

function createHost() {
  const status = vi.fn();
  const json = vi.fn();
  const response = { status, json } as unknown as Response;
  status.mockReturnValue(response);

  const request = {
    method: 'GET',
    originalUrl: '/api/missing',
  } as unknown as Request;

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    filter = new AllExceptionsFilter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats an HttpException', () => {
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException('Nope'), host);

    expect(status).toHaveBeenCalledWith(404);

    const body = json.mock.calls[0][0] as ApiErrorBody;
    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Nope',
      path: '/api/missing',
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('preserves array messages (validation errors)', () => {
    const { host, json } = createHost();

    filter.catch(
      new BadRequestException(['email is required', 'name is required']),
      host,
    );

    const body = json.mock.calls[0][0] as ApiErrorBody;
    expect(body.message).toEqual(['email is required', 'name is required']);
    expect(body.error).toBe('Bad Request');
  });

  it('uses a plain string response as the message', () => {
    const { host, json } = createHost();

    filter.catch(new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT), host);

    const body = json.mock.calls[0][0] as ApiErrorBody;
    expect(body).toMatchObject({
      statusCode: 418,
      error: "I'm a Teapot",
      message: 'Teapot',
    });
  });

  it('hides internal details of unknown errors', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('password=hunter2'), host);

    expect(status).toHaveBeenCalledWith(500);

    const body = json.mock.calls[0][0] as ApiErrorBody;
    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(errorSpy).toHaveBeenCalled();
  });
});
