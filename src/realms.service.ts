import { ResourceId, SourceData } from '@dialectlabs/monitor';
import {
  getAllProposals,
  getAllTokenOwnerRecords,
  getRealms,
  ProgramAccount,
  Proposal,
  Realm,
  TokenOwnerRecord,
} from '@solana/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';
import { Injectable, Logger } from '@nestjs/common';
import { RealmsRestService } from './realms-rest-service';
import { allSettledWithErrorLogging } from './utils/error-handling-utils';
import { groupBy } from './utils/collection-utils';

const mainSplGovernanceProgram = new PublicKey(
  'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
);

const connection = new Connection(
  process.env.REALMS_RPC_URL ?? process.env.RPC_URL!,
);

export interface RealmData {
  realm: ProgramAccount<Realm>;
  subscribers: ResourceId[];
  proposals: ProposalWithMetadata[];
}

export interface ProposalWithMetadata {
  proposal: ProgramAccount<Proposal>;
  author?: PublicKey;
}

@Injectable()
export class RealmsService {
  private readonly logger = new Logger(RealmsService.name);

  constructor(private readonly realmsRestService: RealmsRestService) {}

  async getRealmsData(
    subscribers: ResourceId[],
  ): Promise<SourceData<RealmData>[]> {
    const splGovernancePrograms = await this.getSplGovernancePrograms();
    this.logger.log(
      `Found ${splGovernancePrograms.length} spl governance programs`,
    );
    const realms = await this.getRealms(splGovernancePrograms); /*.filter(
      (it) =>
        it.pubkey.toBase58() === 'AzCvN6DwPozJMhT7bSUok1C2wc4oAmYgm1wTo9vCKLap',
    );*/
    this.logger.log(`Found ${realms.length} realms`);
    const realmPublicKeyToProposals = await this.getProposalsByRealmPublicKey(
      realms,
    );
    this.logger.log(
      `Found ${
        Object.values(realmPublicKeyToProposals).flat().length
      } proposals`,
    );
    const tokenOwnerRecordsByPublicKey =
      await this.getAllTokenOwnerRecordsByPublicKey(realms);
    this.logger.log(
      `Found ${
        Object.keys(tokenOwnerRecordsByPublicKey).length
      } token owner records`,
    );

    const realmPublicKeyToProposalsWithMetadata = Object.fromEntries(
      Object.entries(realmPublicKeyToProposals).map(([k, v]) => [
        k,
        v.map((proposal) => ({
          proposal,
          author:
            tokenOwnerRecordsByPublicKey[
              proposal.account.tokenOwnerRecord.toBase58()
            ]?.account.governingTokenOwner,
        })),
      ]),
    );

    const subscribersByPublicKey = Object.fromEntries(
      subscribers.map((it) => [it.toBase58(), it]),
    );
    const realmPublicKeyToTokenOwnerRecords: Record<
      string,
      ProgramAccount<TokenOwnerRecord>[]
    > = groupBy(Object.values(tokenOwnerRecordsByPublicKey), (it) =>
      it.account.realm.toBase58(),
    );

    const subscribersByRealmPublicKey = Object.fromEntries(
      Object.entries(realmPublicKeyToTokenOwnerRecords).map(([k, v]) => [
        k,
        v.flatMap((it) => {
          const subscriber =
            subscribersByPublicKey[it.account.governingTokenOwner.toBase58()];
          return subscriber ? [subscriber] : [];
        }),
      ]),
    );
    const sourceData: SourceData<RealmData>[] = realms.map((realm) => {
      const proposals =
        realmPublicKeyToProposalsWithMetadata[realm.pubkey.toBase58()] ?? [];
      const subscribers =
        subscribersByRealmPublicKey[realm.pubkey.toBase58()] ?? [];
      const realmData: RealmData = {
        realm,
        subscribers,
        proposals,
      };
      return {
        data: realmData,
        groupingKey: realmData.realm.pubkey.toBase58(),
      };
    });

    return sourceData;
  }

  private async getSplGovernancePrograms(): Promise<PublicKey[]> {
    // return [mainSplGovernanceProgram];
    try {
      const splGovernancePrograms =
        await this.realmsRestService.getSplGovernancePrograms();
      const allSplGovernancePrograms = [
        ...new Set([
          ...splGovernancePrograms.map((it) => it.toBase58()),
          mainSplGovernanceProgram.toBase58(),
        ]),
      ];
      return allSplGovernancePrograms.map((it) => new PublicKey(it));
    } catch (e) {
      const error = e as Error;
      this.logger.error(
        `Failed to get spl governance programs, reason: ${error.message} `,
      );
      return [mainSplGovernanceProgram];
    }
  }

  private async getRealms(splGovernancePrograms: PublicKey[]) {
    const result = await allSettledWithErrorLogging(
      splGovernancePrograms.map((it) => getRealms(connection, it)),
      (errors) => `Failed to get ${errors.length} realms, reasons: ${errors}`,
    );
    return result.fulfilledResults.flat();
  }

  private async getProposalsByRealmPublicKey(
    realms: ProgramAccount<Realm>[],
  ): Promise<Record<string, ProgramAccount<Proposal>[]>> {
    const result = await allSettledWithErrorLogging(
      realms.map(async (it) => {
        const proposals = await getAllProposals(
          connection,
          it.owner,
          it.pubkey,
        );
        return {
          realmPublicKey: it.pubkey,
          proposals: proposals.flat(),
        };
      }),
      (errors) =>
        `Failed to get proposals fpr ${errors.length} reams, reasons: ${errors}`,
    );
    return Object.fromEntries(
      result.fulfilledResults.map(({ realmPublicKey, proposals }) => [
        realmPublicKey.toBase58(),
        proposals,
      ]),
    );
  }

  private async getAllTokenOwnerRecordsByPublicKey(
    realms: ProgramAccount<Realm>[],
  ): Promise<Record<string, ProgramAccount<TokenOwnerRecord>>> {
    const result = await allSettledWithErrorLogging(
      realms.map((it) =>
        getAllTokenOwnerRecords(connection, it.owner, it.pubkey),
      ),
      (errors) =>
        `Failed to get token owner records for ${errors.length} realms, reasons: ${errors}`,
    );
    const flattened = result.fulfilledResults.flat();
    return Object.fromEntries(flattened.map((it) => [it.pubkey, it]));
  }
}
