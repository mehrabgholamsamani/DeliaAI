import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment.js';

describe('environment validation', () => {
  it('requires the database and admin secret in production', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', WEB_ORIGIN: 'https://app.test' })
    ).toThrow();
  });

  it('allows local development with a database URL and no admin token', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'development',
        WEB_ORIGIN: 'http://localhost:5173',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/app'
      }).API_PORT
    ).toBe(4000);
  });
});
