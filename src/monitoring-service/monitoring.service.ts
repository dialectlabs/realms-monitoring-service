import { Connection, PublicKey } from '@solana/web3.js';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DialectConnection } from './dialect-connection';
// import { SquadsService } from '../squads/squads.service';
import {
  Data,
  Monitors,
  Operators,
  Pipelines,
  ResourceId,
  SourceData,
} from '@dialectlabs/monitor';
import { Squad, SquadMember } from '../api/squad';
import { Duration } from 'luxon';
import { getMultipleSquadAccounts } from '../api/parseSquad';

// don't need subscribers
const mainnetStagingPk = new PublicKey(
  'og295qHEFgcX6WyaMLKQPwDMdMxuHoXe7oQ7ywwyRMo',
);
const PROVIDER_URL =
  'https://solana-api.syndica.io/access-token/6sW38nSZ1Qm4WVRN4Vnbjb9EF2QudlpGZBToMtPyqoXqkIenDwJ5FVK1HdWSqqah/rpc';
const connection = new Connection(PROVIDER_URL);

interface SquadData {
  squad: Squad;
  squadMembersSubscribedToNotifications: Record<string, PublicKey>;
}

interface SquadMembersChanged {
  added: SquadMember[];
  removed: SquadMember[];
}

// const isStaging = process.env['NX_ENVIRONMENT'] === 'mainnet-staging';
// console.log('isStaging', isStaging);

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

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
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
      .defineDataSource<SquadData>()
      .poll(
        async (subscribers) => this.getSquads(subscribers),
        Duration.fromObject({ seconds: 10 }),
      )
      .transform<Squad, SquadMembersChanged>({
        keys: ['squad'],
        pipelines: [
          Pipelines.createNew<Squad, SquadData, SquadMembersChanged>(
            (upstream) =>
              upstream
                .pipe(
                  Operators.Window.fixedSizeSliding<Squad, SquadData>(2),
                  Operators.Transform.filter((it) => it.length == 2),
                )
                .pipe(
                  Operators.Transform.map(([d1, d2]) => {
                    const membersAdded = d2.value.members.filter(
                      ({ publicKey: member2 }) =>
                        !d1.value.members.find(({ publicKey: member1 }) =>
                          member2.equals(member1),
                        ),
                    );
                    const membersRemoved = d1.value.members.filter(
                      ({ publicKey: member1 }) =>
                        !d2.value.members.find(({ publicKey: member2 }) =>
                          member2.equals(member1),
                        ),
                    );
                    const squadsMembersChanged: Data<
                      SquadMembersChanged,
                      SquadData
                    > = {
                      value: {
                        added: membersAdded,
                        removed: membersRemoved,
                      },
                      context: d2.context,
                    };
                    return squadsMembersChanged;
                  }),
                )
                .pipe(
                  Operators.Transform.filter(
                    ({ value: { added, removed } }) =>
                      added.length + removed.length > 0,
                  ),
                ),
          ),
        ],
      })
      .notify()
      .dialectThread(
        ({ value, context }) => {
          const message = [
            ...value.added.map(
              (it) =>
                `🚀 New member ${it.publicKey} added to squad ${context.origin.squad.squadName}`,
            ),
            ...value.removed.map(
              (it) =>
                `💰 Member ${it.publicKey} removed from squad ${context.origin.squad.squadName}`,
            ),
          ].join('\n');
          console.log(message);
          return {
            message: message,
          };
        },
        (
          {
            context: {
              origin: { squadMembersSubscribedToNotifications },
            },
          },
          recipient,
        ) => !!squadMembersSubscribedToNotifications[recipient.toBase58()], // TODO: removed or added members will also receive notification, but I think it's not a problem for the first iteration
      )
      .and()
      .dispatch('broadcast')
      .build();
    monitor.start();
  }

  private async getSquads(
    subscribers: ResourceId[],
  ): Promise<SourceData<SquadData>[]> {
    console.log(`Polling data for ${subscribers.length}`);
    const programAccounts = await connection.getProgramAccounts(
      mainnetStagingPk,
    );
    // squads
    const squadsAccounts = programAccounts.filter(
      (it) => it.account.data.length > 8000,
    );
    console.log(`Total squads accounts: ${squadsAccounts.length}`);
    const deserializedSquads = await getMultipleSquadAccounts(
      connection,
      squadsAccounts.map((it) => it.pubkey).slice(),
    );
    console.log("deserialized squads", deserializedSquads);
    const subscribersSet = Object.fromEntries(
      subscribers.map((it) => [it.toBase58(), it]),
    );
    // don't need subscribers
    return deserializedSquads.map((it) => {
      const members = this.getMembers(it, subscribers);
      const sourceData: SourceData<SquadData> = {
        resourceId: it.pubkey,
        data: {
          squad: { ...it, members },
          squadMembersSubscribedToNotifications: Object.fromEntries(
            members
              .map((it) => it.publicKey)
              .filter((it) => subscribersSet[it.toBase58()])
              .map((it) => [it.toBase58(), it]),
          ),
        },
      };
      return sourceData;
    });
  }

  private getMembers(it: Squad, subscribers: ResourceId[]) {
    if (process.env.TEST_MODE) {
      const sliced = it.members.slice(
        0,
        Math.min(it.members.length, subscribers.length),
      );
      return sliced
        .map((it, idx) => ({
          ...it,
          publicKey: subscribers[idx],
        }))
        .slice(0, Math.round(Math.random() * sliced.length));
    }
    return it.members;
  }
}
