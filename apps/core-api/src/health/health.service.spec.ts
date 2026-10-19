import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('reports ok with a rounded uptime and an ISO timestamp', () => {
    const health = new HealthService().getHealth();

    expect(health.status).toBe('ok');
    expect(Number.isInteger(health.uptime)).toBe(true);
    expect(health.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
  });
});
