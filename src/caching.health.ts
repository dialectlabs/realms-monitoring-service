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
  private lastTimout: number;
  private cachingInProgress = false;

  public isHealthy(): HealthIndicatorResult {
    const isHealthy = this.cachingInProgress
      ? Date.now() - this.lastStartedCaching < this.lastTimout
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
  incrementIngestionAttempts({ timeStarted, maxTimeout }: CachingStartedEvent) {
    this.lastTimout = maxTimeout;
    this.lastStartedCaching = timeStarted;
    this.cachingInProgress = true;
  }

  @OnEvent(CachingEventType.Finished)
  resetIngestionAttempts() {
    this.cachingInProgress = false;
  }
}
