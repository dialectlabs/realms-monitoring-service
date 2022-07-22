import { Connection, PublicKey } from '@solana/web3.js';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DialectConnection } from './dialect-connection';
import {
  getAllProposals,
  getAllTokenOwnerRecords,
  getRealm,
  getRealms,
  getTokenOwnerRecord,
  ProgramAccount,
  Proposal,
  Realm,
  TokenOwnerRecord,
} from '@solana/spl-governance';
import {
  TwitterNotification,
  TwitterNotificationsSink,
} from './twitter-notifications-sink';

import {
  Monitors,
  NotificationSink,
  Pipelines,
  ResourceId,
  SourceData,
} from '@dialectlabs/monitor';
import { Duration } from 'luxon';
import * as Axios from 'axios';

const axios = Axios.default;
const splGovInstancesUrl = 'https://realms.today/api/splGovernancePrograms';
const splGovMainInstancePk = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const connection = new Connection(
  process.env.REALMS_PRC_URL ?? process.env.RPC_URL!,
);

interface RealmData {
  realm: ProgramAccount<Realm>;
  proposals: ProgramAccount<Proposal>[];
  realmMembersSubscribedToNotifications: Record<string, PublicKey>;
}

type TokenOwnerRecordToGoverningTokenOwnerType = {
  [key: string]: string;
};

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
  private tokenOwnerRecordToGoverningTokenOwner: TokenOwnerRecordToGoverningTokenOwnerType =
    {};

  constructor(private readonly dialectConnection: DialectConnection) {}

  private static async getProposals(realm: ProgramAccount<Realm>, govInstancePk: PublicKey) {
    const proposals = (
      await getAllProposals(connection, govInstancePk, realm.pubkey)
    ).flat();
    if (process.env.TEST_MODE) {
      return proposals.slice(
        0,
        Math.round(Math.random() * Math.max(0, proposals.length - 3)),
      );
    }
    return proposals;
  }

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
        async (subscribers) => this.getRealmsData(subscribers),
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
        const message = this.constructMessage(realmName, realmId, value);
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
  ): string {
    return [
      ...proposalsAdded.map((it) => {
        let walletAddress =
          this.tokenOwnerRecordToGoverningTokenOwner[
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

  private async getRealmsData(
    subscribers: ResourceId[],
  ): Promise<SourceData<RealmData>[]> {
    this.logger.log(
      `Getting realms data for ${subscribers.length} subscribers`,
    );
    let realmsData: { realm: ProgramAccount<Realm>; proposals: ProgramAccount<Proposal>[]; tokenOwnerRecords: ProgramAccount<TokenOwnerRecord>[]; }[] = [];

    const splGovInstancesGet = await axios.get(splGovInstancesUrl);
    const splGovInstancesRaw = splGovInstancesGet.data;
    if (splGovInstancesGet.status === 200) {
      this.logger.log('Getting realms data for spl-governance instances:');
      this.logger.log(splGovInstancesRaw);
      await Promise.all(
        splGovInstancesRaw.map(async (gov: string) => {
          const govInstancePk = new PublicKey(gov);
          const govInstanceRealms = await getRealms(connection, govInstancePk);
      
          let addRealmsData = await Promise.all(govInstanceRealms.map(async (realm) => {
              return {
                  realm: realm,
                  proposals: await MonitoringService.getProposals(realm, govInstancePk),
                  tokenOwnerRecords: await getAllTokenOwnerRecords(connection, govInstancePk, realm.pubkey),
              }
          }));
          
          realmsData = realmsData.concat(addRealmsData);
          return Promise.resolve();
        }));
    } else {
      this.logger.warn(`Unable to fetch all splGovernance instances from ${splGovInstancesUrl}`);
      this.logger.warn(splGovInstancesGet);
      this.logger.warn(`Proceeding with proposals fetch, but will only be able to get realms for main instance: ${splGovMainInstancePk.toBase58()}`);
      const govInstancePk = splGovMainInstancePk;
      const govInstanceRealms = await getRealms(connection, govInstancePk);
      let addRealmsData = await Promise.all(govInstanceRealms.map(async (realm) => {
          return {
              realm: realm,
              proposals: await MonitoringService.getProposals(realm, govInstancePk),
              tokenOwnerRecords: await getAllTokenOwnerRecords(connection, govInstancePk, realm.pubkey),
          }
      }));
      realmsData = realmsData.concat(addRealmsData);
    }

    if (process.env.TEST_MODE) {
      realmsData = realmsData.slice(0, 20);
    }

    const subscribersSet = Object.fromEntries(
      subscribers.map((it) => [it.toBase58(), it]),
    );
    this.logger.log(
      `Completed getting all realms data for ${realmsData.length} realms`,
    );

    const allProposals: ProgramAccount<Proposal>[] = realmsData
      .map((it) => {
        return it.proposals;
      })
      .flat();

    this.logger.log(
      `Getting all proposal owners for ${allProposals.length} proposals`,
    );

    const proposalsWithOwnerAddressPromises = allProposals.map(
      async (proposal) => {
        return {
          ...proposal,
          tokenOwnerRecord: await getTokenOwnerRecord(
            connection,
            proposal.account.tokenOwnerRecord,
          ),
        };
      },
    );

    const proposalsWithOwnerAddress = await Promise.all(
      proposalsWithOwnerAddressPromises,
    );

    this.tokenOwnerRecordToGoverningTokenOwner = Object.fromEntries(
      proposalsWithOwnerAddress.map((it) => [
        it.account.tokenOwnerRecord.toBase58(),
        it.tokenOwnerRecord.account.governingTokenOwner.toBase58(),
      ]),
    );

    this.logger.log(
      `Completed getting all proposal owners for ${allProposals.length} proposals`,
    );

    return realmsData.map((it) => {
      const realmMembersSubscribedToNotifications: Record<string, PublicKey> =
        process.env.TEST_MODE
          ? Object.fromEntries(subscribers.map((it) => [it.toBase58(), it]))
          : Object.fromEntries(
              it.tokenOwnerRecords
                .map((it) => it.account.governingTokenOwner)
                .filter((it) => subscribersSet[it.toBase58()])
                .map((it) => [it.toBase58(), it]),
            );
      //
      // console.log(
      //   Object.values(realmMembersSubscribedToNotifications).map((it) =>
      //     it.toBase58(),
      //   ),
      // );
      const sourceData: SourceData<RealmData> = {
        resourceId: it.realm.pubkey,
        data: {
          realm: it.realm,
          proposals: it.proposals,
          realmMembersSubscribedToNotifications,
        },
      };
      return sourceData;
    });
  }
}
