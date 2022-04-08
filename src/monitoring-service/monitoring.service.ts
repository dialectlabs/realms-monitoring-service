import { Connection, PublicKey } from '@solana/web3.js';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DialectConnection } from './dialect-connection';
import { getRealms, getAllProposals, Realm, ProgramAccount, Proposal } from '@solana/spl-governance';

import {
  Data,
  Monitors,
  Notification,
  NotificationSink,
  Operators,
  Pipelines,
  ResourceId,
  SourceData,
} from '@dialectlabs/monitor';
import { Duration } from 'luxon';

const mainnetPK = new PublicKey(
  'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
);
const PROVIDER_URL =
  'https://solana-api.syndica.io/access-token/6sW38nSZ1Qm4WVRN4Vnbjb9EF2QudlpGZBToMtPyqoXqkIenDwJ5FVK1HdWSqqah/rpc';
const connection = new Connection(PROVIDER_URL);

interface ProposalsChanged {
  added: ProgramAccount<Proposal>[];
}

interface RealmWithProposals {
  realm: ProgramAccount<Realm>;
  proposals: ProgramAccount<Proposal>[];
}

interface RealmData {
  realm: RealmWithProposals;
}

interface TwitterNotification {
  message: string;
}

/*
Squads use case:
When a member is added or removed from a squad -
1. send a notification to the *other* members of that squad

---

* global data fetch
1. Fetch all squads
2. Flatmap members to huge array

* filter or detect diff
3. Look for diffs in that single array
4. When finding a member added or removed

* Find subscribers to message
5. Find squad
6. Find members of squad that are not the one that just changed
7. Send message
*/

export class ConsoleNotificationSink
  implements NotificationSink<TwitterNotification>
{
  push(notification: TwitterNotification, recipients: ResourceId[]): Promise<void> {
    console.log(
      `Got new notification ${JSON.stringify(
        notification,
      )} for recipients ${recipients}`,
    );
    return Promise.resolve();
  }
}

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly notificationSink: NotificationSink<TwitterNotification> =
    new ConsoleNotificationSink();

  constructor(
    private readonly dialectConnection: DialectConnection, // private readonly squadsService: SquadsService,
  ) {}

  async onModuleInit() {
    this.initMemberAddedOrWithdrawnFromSquad();
  }

  async onModuleDestroy() {
    await Monitors.shutdown();
  }

  private initMemberAddedOrWithdrawnFromSquad() {
    const monitor = Monitors.builder({
      monitorKeypair: this.dialectConnection.getKeypair(),
      dialectProgram: this.dialectConnection.getProgram(),
    })
      .defineDataSource<RealmData>()
      .poll(
        async () => this.getRealmsData(),
        Duration.fromObject({ seconds: 10 }),
      )
      .transform<RealmWithProposals, ProposalsChanged>({
        keys: ['realm'],
        pipelines: [
          Pipelines.createNew<RealmWithProposals, RealmData, ProposalsChanged>(
            (upstream) =>
              upstream
                .pipe(
                  Operators.Window.fixedSizeSliding<RealmWithProposals, RealmData>(2),
                  Operators.Transform.filter((it) => it.length == 2),
                )
                .pipe(
                  Operators.Transform.map(([d1, d2]) => {
                    const proposalsAdded = d2.value.proposals.filter(
                      ({ pubkey: proposal2 }) =>
                        !d1.value.proposals.find(({ pubkey: proposal1 }) =>
                        proposal2.equals(proposal1),
                        ),
                    );
                    const proposalsChanged: Data<
                      ProposalsChanged,
                      RealmData
                    > = {
                      value: {
                        added: proposalsAdded,
                      },
                      context: d2.context,
                    };
                    return proposalsChanged;
                  }),
                )
                .pipe(
                  Operators.Transform.filter(
                    ({ value: { added } }) =>
                      added.length > 0,
                  ),
                ),
          ),
        ],
      })
      .notify()
      .custom<TwitterNotification>((data) => {

          return {message: `Your cratio = ${data.value} above warning threshold`};
        },
        this.notificationSink,
      )
      // .dialectThread(
      //   ({ value, context }) => {
      //     const message = [
      //       ...value.added.map(
      //         (it) =>
      //           `🚀 New member ${it.publicKey} added to squad ${context.origin.squad.squadName}`,
      //       ),
      //       ...value.removed.map(
      //         (it) =>
      //           `💰 Member ${it.publicKey} removed from squad ${context.origin.squad.squadName}`,
      //       ),
      //     ].join('\n');
      //     console.log(message);
      //     return {
      //       message: message,
      //     };
      //   },
      //   (
      //     {
      //       context: {
      //         origin: { squadMembersSubscribedToNotifications },
      //       },
      //     },
      //     recipient,
      //   ) => !!squadMembersSubscribedToNotifications[recipient.toBase58()], // TODO: removed or added members will also receive notification, but I think it's not a problem for the first iteration
      // )
      .and()
      .dispatch('broadcast')
      .build();
    monitor.start();
  }

  private async getRealmsData(): Promise<SourceData<RealmData>[]> {
    const realms = await getRealms(connection, mainnetPK);

    const realmsPromises = realms.map(async realm => {
      return {
        realm: realm,
        proposals: (await getAllProposals(connection, mainnetPK, realm.pubkey)).flat(),
      };
    });

    const realmsData = await Promise.all(realmsPromises);

    return realmsData.map((it) => {
      const sourceData: SourceData<RealmData> = {
        resourceId: it.realm.pubkey,
        data: {
          realm: it,
        },
      };
      return sourceData;
    });
  }
}
