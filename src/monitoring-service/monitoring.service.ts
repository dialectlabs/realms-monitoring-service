import { Connection, PublicKey } from '@solana/web3.js';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DialectConnection } from './dialect-connection';
import { getRealms, getAllProposals, Realm, ProgramAccount, Proposal } from '@solana/spl-governance';
import { TwitterNotificationsSink, TwitterNotification } from './twitter-notifications-sink';

import {
  Data,
  Monitors,
  NotificationSink,
  Operators,
  Pipelines,
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
                  Operators.Transform.filter((it) => {
                    return it.length == 2
                  }),
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
      .custom<TwitterNotification>(({ value, context }) => {
          const realmName = context.origin.realm.realm.account.name;

          const message = [
            ...value.added.map(
              (it) =>
                `📜 New proposal: ${it.account.name} added to ${realmName} by ${it.owner}.${it.account.descriptionLink ? ` Link to: ${it.account.descriptionLink}` : ''}`,
            ),
          ].join('\n');

          console.log(`Sending tweet for ${realmName} : ${message}`);

          return {
            message
          };
        },
        this.notificationSink,
      )
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
