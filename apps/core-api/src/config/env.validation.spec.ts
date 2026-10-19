import { validateEnv } from './env.validation.js';

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/aibi',
};

describe('validateEnv', () => {
  it('applies defaults when only required values are present', () => {
    const env = validateEnv(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it('coerces PORT from a string to a number', () => {
    const env = validateEnv({ ...validEnv, PORT: '4000' });

    expect(env.PORT).toBe(4000);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
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
