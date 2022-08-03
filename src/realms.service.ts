import { ResourceId, SourceData } from '@dialectlabs/monitor';
import {
  getAllProposals,
  getAllTokenOwnerRecords,
  getRealms,
  getTokenOwnerRecord,
  ProgramAccount,
  Proposal,
  Realm,
  TokenOwnerRecord,
} from '@solana/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';
import * as Axios from 'axios';
import { Logger } from '@nestjs/common';

const axios = Axios.default;
const splGovInstancesUrl = 'https://app.realms.today/api/splGovernancePrograms';
const splGovMainInstancePk = new PublicKey(
  'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
);

const connection = new Connection(
  process.env.REALMS_PRC_URL ?? process.env.RPC_URL!,
);

export interface RealmData {
  realm: ProgramAccount<Realm>;
  proposals: ProgramAccount<Proposal>[];
  realmMembersSubscribedToNotifications: Record<string, PublicKey>;
  tokenOwnerRecordToGoverningTokenOwner: TokenOwnerRecordToGoverningTokenOwnerType;
}

export type TokenOwnerRecordToGoverningTokenOwnerType = {
  [key: string]: string;
};

export class RealmsService {
  private readonly logger = new Logger(RealmsService.name);

  private static async getProposals(
    realm: ProgramAccount<Realm>,
    govInstancePk: PublicKey,
  ) {
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

  async getRealmsData(
    subscribers: ResourceId[],
  ): Promise<SourceData<RealmData>[]> {
    this.logger.log(
      `Getting realms data for ${subscribers.length} subscribers`,
    );
    let realmsData: {
      realm: ProgramAccount<Realm>;
      proposals: ProgramAccount<Proposal>[];
      tokenOwnerRecords: ProgramAccount<TokenOwnerRecord>[];
    }[] = [];
    const splGovInstancesRaw: string[] = await this.getGovInstancesSet();
    this.logger.log('Getting realms data for spl-governance instances:');
    this.logger.log(splGovInstancesRaw);
    await Promise.allSettled(
      splGovInstancesRaw.map(async (gov: string) => {
        const govInstancePk = new PublicKey(gov);
        const govInstanceRealms = await getRealms(connection, govInstancePk);
        const addRealmsData: {
          realm: ProgramAccount<Realm>;
          proposals: ProgramAccount<Proposal>[];
          tokenOwnerRecords: ProgramAccount<TokenOwnerRecord>[];
        }[] = [];
        await Promise.allSettled(
          govInstanceRealms.map(async (realm) => {
            return {
              realm: realm,
              proposals: await RealmsService.getProposals(realm, govInstancePk),
              tokenOwnerRecords: await getAllTokenOwnerRecords(
                connection,
                govInstancePk,
                realm.pubkey,
              ),
            };
          }),
        ).then((results) => {
          results.forEach((result) => {
            if (result.status === 'fulfilled') {
              addRealmsData.push(result.value);
            } else {
              this.logger.error(
                `Error loading ${govInstancePk.toBase58()} realm's data:`,
                result,
              );
            }
          });
        });

        realmsData = realmsData.concat(addRealmsData);
        return Promise.resolve();
      }),
    );

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

    const tokenOwnerRecordToGoverningTokenOwner: TokenOwnerRecordToGoverningTokenOwnerType =
      Object.fromEntries(
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
      const sourceData: SourceData<RealmData> = {
        resourceId: it.realm.pubkey,
        data: {
          realm: it.realm,
          proposals: it.proposals,
          realmMembersSubscribedToNotifications,
          tokenOwnerRecordToGoverningTokenOwner,
        },
      };
      return sourceData;
    });
  }

  private async getGovInstancesSet(): Promise<string[]> {
    try {
      const splGovInstancesGet = await axios.get<string[]>(splGovInstancesUrl);
      const data = splGovInstancesGet.data;
      const set = new Set([...data, splGovMainInstancePk.toBase58()]);
      return [...set];
    } catch (e) {
      this.logger.error(
        `Failed to get gov instances, reason ${JSON.stringify(e)} `,
      );
      return [splGovMainInstancePk.toBase58()];
    }
  }
}
