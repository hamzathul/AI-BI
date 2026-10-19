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

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * The single exit door for every failure: HttpExceptions keep their status
 * and message, anything else becomes a generic 500. Internal details are
 * logged server-side, never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const body: ApiErrorBody = {
      statusCode: status,
      error: isServerError
        ? (STATUS_CODES[status] ?? 'Internal Server Error')
        : getError(exceptionResponse, status),
      message: isServerError
        ? 'Internal server error'
        : getMessage(exceptionResponse, exception),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    if (isServerError) {
      this.logger.error(
        `${request.method} ${request.originalUrl} ${status}`,
        exception instanceof Error ? exception.stack : undefined,
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
