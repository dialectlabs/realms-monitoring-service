import { ResourceId, SourceData } from '@dialectlabs/monitor';
import {
  ProgramAccount,
  Proposal,
  Realm,
  TokenOwnerRecord,
} from '@solana/spl-governance';
import { PublicKey } from '@solana/web3.js';
import { Injectable, Logger } from '@nestjs/common';
import { groupBy } from './utils/collection-utils';
import { RealmsRepository } from './realms-repository';
import { chain } from 'lodash';

export interface RealmData {
  realm: ProgramAccount<Realm>;
  subscribers: ResourceId[];
  proposals: ProposalWithMetadata[];
}

export interface ProposalWithMetadata {
  proposal: ProgramAccount<Proposal>;
  author?: PublicKey;
}

export interface ProposalData {
  proposal: ProgramAccount<Proposal>;
  // author: PublicKey;
  realm: ProgramAccount<Realm>;
  realmSubscribers: ResourceId[];
}

@Injectable()
export class RealmsService {
  constructor(private readonly realmsRepository: RealmsRepository) {}

  private readonly logger = new Logger(RealmsService.name);

  async getRealmsData(
    subscribers: ResourceId[],
  ): Promise<SourceData<RealmData>[]> {
    await this.realmsRepository.initialization();
    const realms = this.realmsRepository.realms;
    const proposalsWithMetadataByRealmPublicKey =
      this.getProposalsGroupedByRealmPublicKey();
    const subscribersByRealmPublicKey = this.getSubscribers(subscribers);
    const sourceData: SourceData<RealmData>[] = realms.map((realm) => {
      const proposals =
        proposalsWithMetadataByRealmPublicKey[realm.pubkey.toBase58()] ?? [];
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

  private getSubscribers(subscribers: ResourceId[]) {
    const tokenOwnerRecordsByPublicKey =
      this.realmsRepository.tokenOwnerRecordsByPublicKey;
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
    return subscribersByRealmPublicKey;
  }

  async getProposalData(
    subscribers: ResourceId[],
  ): Promise<SourceData<ProposalData>[]> {
    await this.realmsRepository.initialization();
    const realms = this.realmsRepository.realms;
    const proposals = this.getProposalsGroupedByRealmPublicKey();
    const realmsByPublicKey = Object.fromEntries(
      realms.map((it) => [it.pubkey, it]),
    );
    const subscribersByRealmPublicKey = this.getSubscribers(subscribers);

    const sourceDatas = chain(proposals)
      .flatMap((proposals, realmPublicKey) => {
        const realm: ProgramAccount<Realm> = realmsByPublicKey[realmPublicKey];
        if (!realm) {
          this.logger.warn(`Cannot find realm for pubkey: ${realmPublicKey}`);
          return [];
        }
        const realmSubscribers =
          subscribersByRealmPublicKey[realm.pubkey.toBase58()] ?? [];

        return chain(
          proposals.map((proposal) => {
            const realmData: ProposalData = {
              realm,
              proposal: proposal.proposal,
              // author: subscriber,
              realmSubscribers,
            };
            const sd: SourceData<ProposalData> = {
              groupingKey: proposal.proposal.pubkey.toBase58(),
              data: realmData,
            };
            return sd;
          }),
        )
          .compact()
          .value();
      })
      .value();

    return sourceDatas;
  }

  private getProposalsGroupedByRealmPublicKey() {
    const proposalsGroupedByRealm =
      this.realmsRepository.proposalsGroupedByRealm;
    const tokenOwnerRecordsByPublicKey =
      this.realmsRepository.tokenOwnerRecordsByPublicKey;
    const proposalsWithMetadataByRealmPublicKey: Record<
      string,
      ProposalWithMetadata[]
    > = chain(proposalsGroupedByRealm)
      .mapValues((proposals) =>
        proposals.map((proposal) => ({
          proposal,
          author:
            tokenOwnerRecordsByPublicKey[
              proposal.account.tokenOwnerRecord.toBase58()
            ]?.account.governingTokenOwner,
        })),
      )
      .value();
    return proposalsWithMetadataByRealmPublicKey;
  }
}
