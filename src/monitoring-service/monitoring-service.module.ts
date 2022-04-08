import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { DialectConnection } from './dialect-connection';

//import { SquadsModule } from '../squads/squads.module';

@Module({
  controllers: [],
  //imports: [SquadsModule],
  providers: [
    {
      provide: DialectConnection,
      useValue: DialectConnection.initialize(),
    },
    MonitoringService,
  ],
})
export class MonitoringServiceModule {}
