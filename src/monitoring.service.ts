import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  TwitterNotification,
  TwitterNotificationsSink,
} from './twitter-notifications-sink';

import {
  DialectSdkNotification,
  Monitors,
  NotificationSink,
  Pipelines,
} from '@dialectlabs/monitor';
import { Duration } from 'luxon';

import { DialectSdk } from './dialect-sdk';
import {
  ProposalWithMetadata,
  RealmData,
  RealmsService,
} from './realms.service';
import { ConsoleNotificationSink } from './console-notification-sink';

@Injectable()
export class MonitoringService implements OnModuleInit {
  private readonly twitterNotificationsSink: NotificationSink<TwitterNotification> =
    new TwitterNotificationsSink();

  private readonly consoleNotificationSink: NotificationSink<DialectSdkNotification> =
    new ConsoleNotificationSink<DialectSdkNotification>();

  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly sdk: DialectSdk,
    private readonly realmsService: RealmsService,
  ) {}

  onModuleInit() {
    const monitor = Monitors.builder({
      sdk: this.sdk,
    })
      .defineDataSource<RealmData>()
      .poll(
        async (subscribers) => this.realmsService.getRealmsData(subscribers),
        Duration.fromObject({ seconds: 30 }),
      )
      .transform<ProposalWithMetadata[], ProposalWithMetadata[]>({
        keys: ['proposals'],
        pipelines: [
          Pipelines.added((p1, p2) =>
            p1.proposal.pubkey.equals(p2.proposal.pubkey),
          ),
        ],
      })
      .notify()
      .custom(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
          );
          return {
            title: `📜 New proposal for ${realmName}`,
            message,
          };
        },
        this.consoleNotificationSink,
        { dispatch: 'multicast', to: ({ origin }) => origin.subscribers },
      )
      .dialectSdk(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
          );
          return {
            title: `📜 New proposal for ${realmName}`,
            message,
          };
        },
        { dispatch: 'multicast', to: ({ origin }) => origin.subscribers },
      )
      .custom<TwitterNotification>(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message = this.constructMessage(realmName, realmId, value);
          this.logger.log(`Sending tweet for ${realmName} : ${message}`);
          return {
            message,
          };
        },
        this.twitterNotificationsSink,
        {
          dispatch: 'broadcast',
        },
      )
      .and()
      .build();
    monitor.start();
  }

  private constructMessage(
    realmName: string,
    realmId: string,
    proposalsAdded: ProposalWithMetadata[],
  ): string {
    return [
      ...proposalsAdded.map(({ proposal, author }) => {
        let walletAddress = author?.toBase58();
        if (walletAddress) {
          walletAddress = `${walletAddress.substring(
            0,
            5,
          )}...${walletAddress.substring(walletAddress.length - 5)}`;
        }

        return `📜 New proposal for ${realmName}: https://realms.today/dao/${realmId}/proposal/${proposal.pubkey.toBase58()}
${proposal.account.name}${walletAddress ? ` added by ${walletAddress}` : ''}`;
      }),
    ].join('\n');
  }
}
