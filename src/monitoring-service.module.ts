import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { DialectConnection } from './dialect-connection';
import { RealmsService } from './realms.service';

@Module({
  controllers: [],
  providers: [
    {
      provide: DialectConnection,
      useValue: DialectConnection.initialize(),
    },
    RealmsService,
    MonitoringService,
  ],
})
export class MonitoringServiceModule {}
