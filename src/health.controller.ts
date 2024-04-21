import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { CachingHealth } from './caching.health';

@Controller({
  path: 'health',
  version: '1',
})
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private readonly cachingHealth: CachingHealth,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.cachingHealth.isHealthy()]);
  }
}
