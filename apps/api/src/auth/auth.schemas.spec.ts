import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';
import { onboardingSchema, signUpSchema } from './auth.schemas.js';

describe('account onboarding validation', () => {
  it('requires a long password and a usable business name at signup', () => {
    expect(() =>
      signUpSchema.parse({
        email: 'owner@example.test',
        password: 'too-short',
        businessName: 'Studio'
      })
    ).toThrow();
    expect(
      signUpSchema.parse({
        email: 'OWNER@example.test',
        password: 'a-secure-password',
        businessName: 'Studio'
      }).email
    ).toBe('owner@example.test');
  });

  it('requires meaningful guided business information', () => {
    expect(() =>
      onboardingSchema.parse({
        businessName: 'Studio',
        industry: 'Salon',
        companyDescription: 'Too short',
        contactDetails: 'Phone',
        timezone: 'Europe/Berlin',
        greeting: 'Hello',
        bookingInstructions: 'Book',
        handoffInstructions: 'Call'
      })
    ).toThrow();
  });

  it('compares CSRF tokens without accepting a mismatch', () => {
    const auth = new AuthService({} as never, {} as never);
    const account = { csrfToken: 'known-token' } as never;
    expect(auth.csrfMatches(account, 'known-token')).toBe(true);
    expect(auth.csrfMatches(account, 'other-token')).toBe(false);
    expect(auth.csrfMatches(account, undefined)).toBe(false);
  });
});
