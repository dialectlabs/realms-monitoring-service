import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HttpModule } from '@nestjs/axios';
import { Dialect, DialectSdk, Environment } from '@dialectlabs/sdk';
import { ConfigModule } from '@nestjs/config';
import { RealmsRestService } from './realms-rest-service';
import { RealmsService } from './realms.service';
import { RealmsCache } from './realms-cache';
import { ScheduleModule } from '@nestjs/schedule';
import { NewProposalsMonitoringService } from './new-proposals-monitoring.service';
import { ProposalStateChangeMonitoringService } from './proposal-state-monitoring.service';
import { HealthController } from './health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { CachingHealth } from './caching.health';
import { EventEmitterModule } from '@nestjs/event-emitter';
import {
  NodeDialectSolanaWalletAdapter,
  Solana,
  SolanaSdkFactory,
} from '@dialectlabs/blockchain-sdk-solana';

@Module({
  imports: [
    TerminusModule,
    HttpModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot(),
    EventEmitterModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: process.env.ENVIRONMENT !== 'production',
        redact: ['req.headers'],
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: process.env.ENVIRONMENT === 'local-development',
            translateTime: true,
            singleLine: true,
            ignore: 'pid,hostname',
          },
        },
      },
    }),
  ],
  controllers: [HealthController],
  providers: [
    RealmsCache,
    CachingHealth,
    RealmsRestService,
    RealmsService,
    NewProposalsMonitoringService,
    ProposalStateChangeMonitoringService,
    {
      provide: DialectSdk<Solana>,
      useValue: Dialect.sdk(
        {
          environment: process.env.DIALECT_SDK_ENVIRONMENT as Environment,
        },
        SolanaSdkFactory.create({
          // IMPORTANT: must set environment variable DIALECT_SDK_CREDENTIALS
          // to your dapp's Solana messaging wallet keypair e.g. [170,23, . . . ,300]
          wallet: NodeDialectSolanaWalletAdapter.create(),
        }),
      ),
    },
  ],
})
export class AppModule {}
