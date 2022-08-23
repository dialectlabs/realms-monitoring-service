import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Connection, PublicKey } from '@solana/web3.js';
import { Interval } from 'luxon';
import {
  getAllProposals,
  getAllTokenOwnerRecords,
  getRealms,
  ProgramAccount,
  Proposal,
  Realm,
  TokenOwnerRecord,
} from '@solana/spl-governance';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RealmsRestService } from './realms-rest-service';
import { allSettledWithErrorLogging } from './utils/error-handling-utils';

const mainSplGovernanceProgram = new PublicKey(
  'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
);

const connection = new Connection(
  process.env.DIALECT_SDK_SOLANA_RPC_URL ?? process.env.REALMS_SOLANA_RPC_URL!,
);

@Injectable()
export class RealmsRepository implements OnModuleInit {
  private readonly logger = new Logger(RealmsRepository.name);

  splGovernancePrograms: PublicKey[] = [];
  realms: Record<string, ProgramAccount<Realm>> = {};
  proposalsGroupedByRealm: Record<string, ProgramAccount<Proposal>[]> = {};
  tokenOwnerRecordsByPublicKey: Record<
    string,
    ProgramAccount<TokenOwnerRecord>
  > = {};

  cachingInProgress = false;
  isInitialized: Promise<void>;

  constructor(private readonly realmsRestService: RealmsRestService) {}

  async onModuleInit() {
    this.isInitialized = this.tryCacheData();
  }

  async initialization(): Promise<void> {
    return this.isInitialized;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tryCacheData() {
    if (this.cachingInProgress) {
      return;
    }
    this.cachingInProgress = true;
    try {
      await this.cacheAccounts();
    } finally {
      this.cachingInProgress = false;
    }
  }

  async cacheAccounts() {
    const now = new Date();
    this.logger.log(`Started caching account addresses`);
    this.splGovernancePrograms = await this.getSplGovernancePrograms();
    this.logger.log(
      `Found ${this.splGovernancePrograms.length} spl governance programs`,
    );
    const fetchedRealms = await this.getRealms(this.splGovernancePrograms);
    this.realms = Object.assign(this.realms, fetchedRealms);
    /*.filter(
      (it) =>
        it.pubkey.toBase58() === 'AzCvN6DwPozJMhT7bSUok1C2wc4oAmYgm1wTo9vCKLap',
    );*/
    this.logger.log(`Found ${this.realms.length} realms`);
    const fetchedProposals = await this.getProposalsByRealmPublicKey(
      Object.values(this.realms),
    );
    this.proposalsGroupedByRealm = Object.assign(
      this.proposalsGroupedByRealm,
      fetchedProposals,
    );
    this.logger.log(
      `Found ${
        Object.values(this.proposalsGroupedByRealm).flat().length
      } proposals`,
    );
    const fetchedTokenOwnerRecords =
      await this.getAllTokenOwnerRecordsByPublicKey(Object.values(this.realms));
    this.tokenOwnerRecordsByPublicKey = Object.assign(
      this.tokenOwnerRecordsByPublicKey,
      fetchedTokenOwnerRecords,
    );
    this.logger.log(
      `Found ${
        Object.keys(this.tokenOwnerRecordsByPublicKey).length
      } token owner records`,
    );
    const elapsed = Interval.fromDateTimes(now, new Date()).toDuration();
    this.logger.log(`Elapsed ${elapsed.toISO()} to cache accounts.'`);
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
    const flat = result.fulfilledResults.flat();
    return Object.fromEntries(flat.map((it) => [it.pubkey.toBase58(), it]));
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
