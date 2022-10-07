import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

export interface CachingEvent {
  type: CachingEventType;
}

export interface CachingStartedEvent extends CachingEvent {
  type: CachingEventType.Started;
  timeStarted: number;
}

export interface CachingFinishedEvent extends CachingEvent {
  type: CachingEventType.Finished;
}

export enum CachingEventType {
  Started = 'caching.started',
  Finished = 'caching.finished',
}

@Injectable()
export class CachingHealth extends HealthIndicator {
  private static readonly MAX_CACHING_EXECUTION_TIME_MILLIS = process.env
    .MAX_CACHING_EXECUTION_TIME_MILLIS
    ? parseInt(process.env.MAX_CACHING_EXECUTION_TIME_MILLIS, 10)
    : 600000;
  private lastStartedCaching: number;
  private cachingInProgress = false;

  public isHealthy(): HealthIndicatorResult {
    const isHealthy = this.cachingInProgress
      ? Date.now() - this.lastStartedCaching <
        CachingHealth.MAX_CACHING_EXECUTION_TIME_MILLIS
      : true;
    if (isHealthy) {
      return this.getStatus('caching', isHealthy);
    }
    throw new HealthCheckError(
      'Caching failed',
      this.getStatus('caching', isHealthy),
    );
  }

  @OnEvent(CachingEventType.Started)
  onCachingStarted({ timeStarted }: CachingStartedEvent) {
    this.lastStartedCaching = timeStarted;
    this.cachingInProgress = true;
  }

  @OnEvent(CachingEventType.Finished)
  onCachingFinished() {
    this.cachingInProgress = false;
  }
}
