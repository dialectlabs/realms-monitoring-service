import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HttpModule } from '@nestjs/axios';
import {
  Dialect,
  Environment,
  NodeDialectWalletAdapter,
  SolanaNetwork,
} from '@dialectlabs/sdk';
import { DialectSdk } from './dialect-sdk';
import { ConfigModule } from '@nestjs/config';
import { RealmsRestService } from './realms-rest-service';
import { RealmsService } from './realms.service';
import { RealmsRepository } from './realms-repository';
import { ScheduleModule } from '@nestjs/schedule';
import { NewProposalsMonitoringService } from './new-proposals-monitoring.service';
import { ProposalStateChangeMonitoringService } from './proposal-state-monitoring.service';

@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot(),
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
  controllers: [],
  providers: [
    RealmsRestService,
    RealmsRepository,
    RealmsService,
    NewProposalsMonitoringService,
    ProposalStateChangeMonitoringService,
    {
      provide: DialectSdk,
      useValue: Dialect.sdk({
        environment: process.env.DIALECT_SDK_ENVIRONMENT as Environment,
        solana: {
          network: process.env.DIALECT_SDK_SOLANA_NETWORK_NAME as SolanaNetwork,
          rpcUrl: process.env.DIALECT_SDK_SOLANA_RPC_URL,
        },
        wallet: NodeDialectWalletAdapter.create(),
      }),
    },
  ],
})
export class AppModule {}
