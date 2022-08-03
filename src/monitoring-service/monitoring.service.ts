import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DialectConnection } from './dialect-connection';
import { ProgramAccount, Proposal } from '@solana/spl-governance';
import {
  TwitterNotification,
  TwitterNotificationsSink,
} from './twitter-notifications-sink';

import { Monitors, NotificationSink, Pipelines } from '@dialectlabs/monitor';
import { Duration } from 'luxon';
import {
  RealmData,
  RealmsService,
  TokenOwnerRecordToGoverningTokenOwnerType,
} from './realms.service';

/*
Realms use case:
When a proposal is added to a realm -
1. send a tweet out

---

* global data fetch
1. Fetch all realms
2. Fetch all proposals

* filter or detect diff
3. Look for diffs in the proposals array
4. When finding a proposal added or removed
5. Send out tweet for new proposal
*/

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly notificationSink: NotificationSink<TwitterNotification> =
    new TwitterNotificationsSink();

  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly dialectConnection: DialectConnection,
    private readonly realmsService: RealmsService,
  ) {}

  async onModuleInit() {
    this.initMonitor();
  }

  async onModuleDestroy() {
    await Monitors.shutdown();
  }

  private initMonitor() {
    const monitor = Monitors.builder({
      monitorKeypair: this.dialectConnection.getKeypair(),
      dialectProgram: this.dialectConnection.getProgram(),
      sinks: {
        sms: {
          twilioUsername: process.env.TWILIO_ACCOUNT_SID!,
          twilioPassword: process.env.TWILIO_AUTH_TOKEN!,
          senderSmsNumber: process.env.TWILIO_SMS_SENDER!,
        },
        email: {
          apiToken: process.env.SENDGRID_KEY!,
          senderEmail: process.env.SENDGRID_EMAIL!,
        },
        telegram: {
          telegramBotToken: process.env.TELEGRAM_TOKEN!,
        },
      },
      web2SubscriberRepositoryUrl: process.env.WEB2_SUBSCRIBER_SERVICE_BASE_URL,
    })
      .defineDataSource<RealmData>()
      .poll(
        async (subscribers) => this.realmsService.getRealmsData(subscribers),
        Duration.fromObject({ seconds: 60 }),
      )
      .transform<ProgramAccount<Proposal>[], ProgramAccount<Proposal>[]>({
        keys: ['proposals'],
        pipelines: [Pipelines.added((p1, p2) => p1.pubkey.equals(p2.pubkey))],
      })
      .notify()
      .dialectThread(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
            context.origin.tokenOwnerRecordToGoverningTokenOwner,
          );
          this.logger.log(`Sending dialect message: ${message}`);
          return {
            message: message,
          };
        },
        (
          {
            context: {
              origin: { realmMembersSubscribedToNotifications },
            },
          },
          recipient,
        ) => !!realmMembersSubscribedToNotifications[recipient.toBase58()],
      )
      .telegram(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
            context.origin.tokenOwnerRecordToGoverningTokenOwner,
          );
          this.logger.log(`Sending telegram message: ${message}`);
          return {
            body: message,
          };
        },
        (
          {
            context: {
              origin: { realmMembersSubscribedToNotifications },
            },
          },
          recipient,
        ) => !!realmMembersSubscribedToNotifications[recipient.toBase58()],
      )
      .sms(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
            context.origin.tokenOwnerRecordToGoverningTokenOwner,
          );
          this.logger.log(`Sending telegram message: ${message}`);
          return {
            body: message,
          };
        },
        (
          {
            context: {
              origin: { realmMembersSubscribedToNotifications },
            },
          },
          recipient,
        ) => !!realmMembersSubscribedToNotifications[recipient.toBase58()],
      )
      .email(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
            context.origin.tokenOwnerRecordToGoverningTokenOwner,
          );
          this.logger.log(`Sending telegram message: ${message}`);
          return {
            subject: `📜 New proposal for ${realmName}`,
            text: message,
          };
        },
        (
          {
            context: {
              origin: { realmMembersSubscribedToNotifications },
            },
          },
          recipient,
        ) => !!realmMembersSubscribedToNotifications[recipient.toBase58()],
      )
      .custom<TwitterNotification>(({ value, context }) => {
        const realmName: string = context.origin.realm.account.name;
        const realmId: string = context.origin.realm.pubkey.toBase58();
        const message = this.constructMessage(
          realmName,
          realmId,
          value,
          context.origin.tokenOwnerRecordToGoverningTokenOwner,
        );
        this.logger.log(`Sending tweet for ${realmName} : ${message}`);
        return {
          message,
        };
      }, this.notificationSink)
      .and()
      .dispatch('broadcast')
      .build();
    monitor.start();
  }

  private constructMessage(
    realmName: string,
    realmId: string,
    proposalsAdded: ProgramAccount<Proposal>[],
    tokenOwnerRecordToGoverningTokenOwner: TokenOwnerRecordToGoverningTokenOwnerType,
  ): string {
    return [
      ...proposalsAdded.map((it) => {
        let walletAddress =
          tokenOwnerRecordToGoverningTokenOwner[
            it.account.tokenOwnerRecord.toBase58()
          ];

        if (walletAddress) {
          walletAddress = `${walletAddress.substring(
            0,
            5,
          )}...${walletAddress.substring(walletAddress.length - 5)}`;
        }

        return `📜 New proposal for ${realmName}: https://realms.today/dao/${realmId}/proposal/${it.pubkey.toBase58()}
${it.account.name}${walletAddress ? ` added by ${walletAddress}` : ''}`;
      }),
    ].join('\n');
  }
}
