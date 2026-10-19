import { Injectable } from '@nestjs/common';
import type { HealthDto } from './health.dto.js';

@Injectable()
export class HealthService {
  getHealth(): HealthDto {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
