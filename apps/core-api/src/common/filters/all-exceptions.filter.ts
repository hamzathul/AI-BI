import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { Request, Response } from 'express';
import type { ApiErrorDto } from '../dto/api-error.dto.js';
import {
  ConnectorError,
  type ConnectorErrorCode,
} from '../../connectors/connector.errors.js';

/**
 * Connector failures are upstream failures, not client mistakes (D39).
 * AUTH/PERMISSION are 502 rather than 401/403: the client did not fail to
 * authenticate with *our* API — the server's configured source credential did.
 */
export const CONNECTOR_ERROR_STATUS: Readonly<
  Record<ConnectorErrorCode, number>
> = {
  CONNECTION: HttpStatus.BAD_GATEWAY,
  AUTH: HttpStatus.BAD_GATEWAY,
  PERMISSION: HttpStatus.BAD_GATEWAY,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  SYNTAX: HttpStatus.UNPROCESSABLE_ENTITY,
  TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  UNSUPPORTED: HttpStatus.NOT_IMPLEMENTED,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * The single exit door for every failure: HttpExceptions keep their status
 * and message, ConnectorErrors use the upstream mapping above, and anything
 * else becomes a generic 500. Internal details are logged server-side, never
 * sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const connectorError =
      exception instanceof ConnectorError ? exception : null;

    const status = connectorError
      ? CONNECTOR_ERROR_STATUS[connectorError.code]
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const body: ApiErrorDto = {
      statusCode: status,
      error: connectorError
        ? (STATUS_CODES[status] ?? 'Error')
        : isServerError
          ? (STATUS_CODES[status] ?? 'Internal Server Error')
          : getError(exceptionResponse, status),
      message: connectorError
        ? connectorError.message
        : isServerError
          ? 'Internal server error'
          : getMessage(exceptionResponse, exception),
      ...(connectorError ? { code: connectorError.code } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    if (isServerError) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      const cause =
        connectorError?.cause instanceof Error
          ? connectorError.cause.stack
          : undefined;

      this.logger.error(
        `${request.method} ${request.originalUrl} ${status}`,
        [stack, cause].filter(Boolean).join('\n') || undefined,
      );
    }

    response.status(status).json(body);
  }
}

function getMessage(
  exceptionResponse: string | object | undefined,
  exception: unknown,
): string | string[] {
  if (typeof exceptionResponse === 'string') {
    return exceptionResponse;
  }

  if (exceptionResponse && typeof exceptionResponse === 'object') {
    const message = (exceptionResponse as { message?: unknown }).message;

    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(message)) {
      return message.map(String);
    }
  }

  return exception instanceof Error ? exception.message : 'Unknown error';
}

function getError(
  exceptionResponse: string | object | undefined,
  status: number,
): string {
  if (exceptionResponse && typeof exceptionResponse === 'object') {
    const error = (exceptionResponse as { error?: unknown }).error;

    if (typeof error === 'string') {
      return error;
    }
  }

  return STATUS_CODES[status] ?? 'Error';
}
