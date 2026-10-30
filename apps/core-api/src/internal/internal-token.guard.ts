import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/** Constant-time comparison needs equal-length inputs; hashing guarantees it. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** `Authorization: Bearer <token>` — header only, never a query parameter. */
function bearerToken(request: Request): string | null {
  const header = request.headers.authorization;

  if (typeof header !== 'string') return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Locks the `/api/internal/*` routes to the ai-service (D60).
 *
 * A missing, malformed, or wrong token gets the same 401: the caller learns
 * whether it may enter, not why it may not. The expected token comes from
 * `INTERNAL_API_TOKEN`, validated at boot (env.validation.ts).
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.getOrThrow<string>('INTERNAL_API_TOKEN');
    const request = context.switchToHttp().getRequest<Request>();
    const provided = bearerToken(request);

    if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
      throw new UnauthorizedException('Invalid or missing service token.');
    }

    return true;
  }
}
