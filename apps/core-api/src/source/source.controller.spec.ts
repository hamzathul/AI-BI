import { Test, type TestingModule } from '@nestjs/testing';
import { SourceController } from './source.controller.js';
import { SourceService } from './source.service.js';

describe('SourceController', () => {
  let sourceController: SourceController;
  const sourceService = {
    getStatus: vi.fn(),
  };

  beforeEach(async () => {
    sourceService.getStatus.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SourceController],
      providers: [{ provide: SourceService, useValue: sourceService }],
    }).compile();

    sourceController = module.get<SourceController>(SourceController);
  });

  it('returns the service result unchanged', async () => {
    const status = {
      configured: true,
      database: 'acme',
      lastSync: null,
    };
    sourceService.getStatus.mockResolvedValue(status);

    await expect(sourceController.getStatus()).resolves.toBe(status);
    expect(sourceService.getStatus).toHaveBeenCalledOnce();
  });
});
