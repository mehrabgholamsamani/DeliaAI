import { describe, expect, it } from 'vitest';
import { AppService } from './app.service.js';

describe('AppService', () => {
  it('reports a healthy API', () => {
    const health = new AppService({
      $queryRaw: async () => [{ '?column?': 1 }]
    } as never).getHealth();

    expect(health.status).toBe('ok');
    expect(health.service).toBe('ai-receptionist-api');
  });
});
