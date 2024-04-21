import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { Injectable, Logger } from '@nestjs/common';
import { RealmsCache } from './realms-cache';

@Injectable()
export class CachingHealth extends HealthIndicator {
  private static MAX_STATIC_ACCOUNT_CACHE_AGE_MILLIS =
    process.env.MAX_CACHE_AGE_MILLIS ?? 3 * 60 * 60 * 1000;

  private static MAX_DYNAMIC_ACCOUNT_CACHE_AGE_MILLIS =
    process.env.MAX_CACHE_AGE_MILLIS ?? 30 * 60 * 1000;

  private readonly logger = new Logger(CachingHealth.name);

  constructor(private readonly realmsCache: RealmsCache) {
    super();
  }

  public isHealthy(): HealthIndicatorResult {
    if (this.realmsCache.initializationError) {
      this.logger.error(
        'Caching health check failed. Service needs to be restarted, because initialization failed',
      );
      throw new HealthCheckError(
        'Caching failed',
        this.getStatus('caching', false),
      );
    }

    if (!this.realmsCache.isInitialized) {
      return this.getStatus('caching', true);
    }

    if (
      !this.realmsCache.lastDynamicAccountCachingSuccessFinishedAt ||
      !this.realmsCache.lastStaticAccountCachingSuccessFinishedAt
    ) {
      this.logger.error(
        `Some of the cache ages are not initialized, this should not happen. 
  Static cache age: ${this.realmsCache.lastStaticAccountCachingSuccessFinishedAt}, dynamic cache age: ${this.realmsCache.lastDynamicAccountCachingSuccessFinishedAt}
  Service needs to be restarted`,
      );
      throw new HealthCheckError(
        'Caching failed',
        this.getStatus('caching', false),
      );
    }

    const staticCacheAge =
      Date.now() -
      this.realmsCache.lastStaticAccountCachingSuccessFinishedAt.getTime();

    if (staticCacheAge > CachingHealth.MAX_STATIC_ACCOUNT_CACHE_AGE_MILLIS) {
      this.logger.error(
        `Static cache age is too old: ${staticCacheAge}, service needs to be restarted`,
      );
      throw new HealthCheckError(
        'Caching failed',
        this.getStatus('caching', false),
      );
    }

    const dynamicCacheAge =
      Date.now() -
      this.realmsCache.lastDynamicAccountCachingSuccessFinishedAt.getTime();

    if (dynamicCacheAge > CachingHealth.MAX_DYNAMIC_ACCOUNT_CACHE_AGE_MILLIS) {
      this.logger.error(
        `Dynamic cache age is too old: ${dynamicCacheAge}, service needs to be restarted`,
      );
      throw new HealthCheckError(
        'Caching failed',
        this.getStatus('caching', false),
      );
    }

    return this.getStatus('caching', true);
  }
}
