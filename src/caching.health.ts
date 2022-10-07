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
  maxTimeout: number;
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
  private lastStartedCaching: number;
  private lastTimeout: number;
  private cachingInProgress = false;

  public isHealthy(): HealthIndicatorResult {
    const isHealthy = this.cachingInProgress
      ? Date.now() - this.lastStartedCaching < this.lastTimeout
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
  onCachingStarted({ timeStarted, maxTimeout }: CachingStartedEvent) {
    this.lastTimeout = maxTimeout;
    this.lastStartedCaching = timeStarted;
    this.cachingInProgress = true;
  }

  @OnEvent(CachingEventType.Finished)
  onCachingFinished() {
    this.cachingInProgress = false;
  }
}
