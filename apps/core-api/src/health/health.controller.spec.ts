import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let healthController: HealthController;
  const healthService = {
    getHealth: vi.fn(),
  };

  beforeEach(async () => {
    healthService.getHealth.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    healthController = module.get<HealthController>(HealthController);
  });

  it('returns the service result unchanged', () => {
    const health = {
      status: 'ok' as const,
      uptime: 12,
      timestamp: '2026-10-19T15:07:33.019Z',
    };
    healthService.getHealth.mockReturnValue(health);

    expect(healthController.getHealth()).toBe(health);
    expect(healthService.getHealth).toHaveBeenCalledOnce();
  });
});
