import { Module } from '@nestjs/common';
import { MonitoringServiceModule } from './monitoring-service/monitoring-service.module';

@Module({
  imports: [MonitoringServiceModule],
  providers: [],
})
export class AppModule {}
