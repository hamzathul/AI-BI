import { validateEnv } from './env.validation.js';

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/aibi',
  SOURCE_DATABASE_URL:
    'postgresql://acme_reader:acme_reader_dev@localhost:5433/acme',
  INTERNAL_API_TOKEN: 'test-only-token-0123456789abcdef0123456789abcdef',
};

describe('validateEnv', () => {
  it('applies defaults when only required values are present', () => {
    const env = validateEnv(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.SOURCE_DATABASE_URL).toBe(validEnv.SOURCE_DATABASE_URL);
  });

  it('coerces PORT from a string to a number', () => {
    const env = validateEnv({ ...validEnv, PORT: '4000' });

    expect(env.PORT).toBe(4000);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() =>
      validateEnv({ SOURCE_DATABASE_URL: validEnv.SOURCE_DATABASE_URL }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects a missing SOURCE_DATABASE_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toThrow(
      /SOURCE_DATABASE_URL/,
    );
  });

  it('rejects a missing INTERNAL_API_TOKEN', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        SOURCE_DATABASE_URL: validEnv.SOURCE_DATABASE_URL,
      }),
    ).toThrow(/INTERNAL_API_TOKEN/);
  });

  it('rejects an INTERNAL_API_TOKEN shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ ...validEnv, INTERNAL_API_TOKEN: 'too-short' }),
    ).toThrow(/32 characters/);
  });

  it('rejects an invalid WEB_ORIGIN', () => {
    expect(() => validateEnv({ ...validEnv, WEB_ORIGIN: 'not-a-url' })).toThrow(
      /WEB_ORIGIN/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'not-a-port' })).toThrow(
      /PORT/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});
