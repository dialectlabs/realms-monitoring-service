import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  TwitterNotification,
  TwitterNotificationsSink,
} from './twitter-notifications-sink';

import { Monitors, NotificationSink, Pipelines } from '@dialectlabs/monitor';
import { Duration } from 'luxon';

import { DialectSdk } from './dialect-sdk';
import { NOTIF_TYPE_ID_PROPOSALS } from './main';
import {
  ProposalWithMetadata,
  RealmData,
  RealmsService,
} from './realms.service';

@Injectable()
export class NewProposalsMonitoringService implements OnModuleInit {
  private readonly twitterNotificationsSink: NotificationSink<TwitterNotification> =
    new TwitterNotificationsSink();

  private readonly logger = new Logger(NewProposalsMonitoringService.name);

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
      .notify({
        type: {
          id: NOTIF_TYPE_ID_PROPOSALS,
        },
      })
      // .custom<DialectSdkNotification>(
      //   ({ value, context }) => {
      //     const realmName: string = context.origin.realm.account.name;
      //     const realmId: string = context.origin.realm.pubkey.toBase58();
      //     const message: string = this.constructMessage(
      //       realmName,
      //       realmId,
      //       value,
      //     );
      //     this.logger.log(
      //       `Sending message for ${context.origin.subscribers.length} subscribers of realm ${realmId} : ${message}`,
      //     );
      //     return {
      //       title: `New proposal for ${realmName}`,
      //       message,
      //     };
      //   },
      //   new ConsoleNotificationSink(),
      //   {
      //     dispatch: 'multicast',
      //     to: (ctx) => ctx.origin.subscribers,
      //   },
      // )
      .dialectSdk(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
          );
          this.logger.log(
            `Sending message for ${context.origin.subscribers.length} subscribers of realm ${realmId} : ${message}`,
          );
          return {
            title: `New proposal for ${realmName}`,
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
