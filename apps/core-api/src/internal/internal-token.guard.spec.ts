import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InternalTokenGuard } from './internal-token.guard.js';

const TOKEN = 'test-only-token-0123456789abcdef0123456789abcdef';

function guard(): InternalTokenGuard {
  const config = {
    getOrThrow: () => TOKEN,
  } as unknown as ConfigService;

  return new InternalTokenGuard(config);
}

function contextWith(
  headers: Record<string, string | string[] | undefined>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('InternalTokenGuard', () => {
  it('accepts the configured bearer token', () => {
    expect(
      guard().canActivate(contextWith({ authorization: `Bearer ${TOKEN}` })),
    ).toBe(true);
  });

  it('accepts a case-insensitive scheme and surrounding whitespace', () => {
    expect(
      guard().canActivate(contextWith({ authorization: `  bearer ${TOKEN} ` })),
    ).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(() => guard().canActivate(contextWith({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a non-Bearer scheme', () => {
    expect(() =>
      guard().canActivate(contextWith({ authorization: `Basic ${TOKEN}` })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a wrong token, including a different length', () => {
    expect(() =>
      guard().canActivate(contextWith({ authorization: 'Bearer nope' })),
    ).toThrow(UnauthorizedException);
    expect(() =>
      guard().canActivate(
        contextWith({ authorization: `Bearer ${TOKEN.slice(0, -1)}` }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('does not echo the expected token or the reason in the error', () => {
    try {
      guard().canActivate(contextWith({ authorization: 'Bearer nope' }));
      expect.unreachable('expected the guard to reject the request');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      const body = (error as UnauthorizedException).getResponse();
      expect(JSON.stringify(body)).not.toContain(TOKEN);
      expect(body).toMatchObject({
        message: 'Invalid or missing service token.',
      });
    }
  });
});
