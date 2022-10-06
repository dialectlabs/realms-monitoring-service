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
import { MintInfo, MintLayout, u64 } from '@solana/spl-token';
import * as BN from 'bn.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CachingEventType,
  CachingFinishedEvent,
  CachingStartedEvent,
} from './caching.health';

const mainSplGovernanceProgram = new PublicKey(
  'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
);

const connection = new Connection(
  process.env.DIALECT_SDK_SOLANA_RPC_URL ?? process.env.REALMS_SOLANA_RPC_URL!,
);
export type TokenProgramAccount<T> = {
  publicKey: PublicKey;
  account: T;
};

export type MintAccount = MintInfo;

export interface RealmMints {
  mint?: MintInfo;
  councilMint?: MintInfo;
}

@Injectable()
export class RealmsRepository implements OnModuleInit {
  private static readonly MAX_CACHING_EXECUTION_TIME_MILLS = process.env
    .MAX_CACHING_EXECUTION_TIME_MILLS
    ? parseInt(process.env.MAX_CACHING_EXECUTION_TIME_MILLS, 10)
    : 600000;
  private static readonly SET_TIMEOUT_DELAY = 10000;
  private readonly logger = new Logger(RealmsRepository.name);

  splGovernancePrograms: PublicKey[] = [];
  realms: Record<string, ProgramAccount<Realm & RealmMints>> = {};
  proposalsGroupedByRealm: Record<string, ProgramAccount<Proposal>[]> = {};
  tokenOwnerRecordsByPublicKey: Record<
    string,
    ProgramAccount<TokenOwnerRecord>
  > = {};

  cachingInProgress = false;
  isInitialized: Promise<void>;

  constructor(
    private readonly realmsRestService: RealmsRestService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
    const cachingStartedEvent: CachingStartedEvent = {
      timeStarted: Date.now(),
      maxTimeout:
        RealmsRepository.MAX_CACHING_EXECUTION_TIME_MILLS +
        RealmsRepository.SET_TIMEOUT_DELAY,
      type: CachingEventType.Started,
    };
    this.eventEmitter.emit(CachingEventType.Started, cachingStartedEvent);
    try {
      await this.cacheAccounts();
    } finally {
      this.cachingInProgress = false;
      const cachingFinishedEvent: CachingFinishedEvent = {
        type: CachingEventType.Finished,
      };
      this.eventEmitter.emit(CachingEventType.Finished, cachingFinishedEvent);
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
    this.logger.log(`Found ${Object.values(this.realms).length} realms`);
    this.logger.log('Start finding proposals');
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
    const allRealms = result.fulfilledResults.flat();

    const realmsWithMints = await allSettledWithErrorLogging(
      allRealms.map(async (realm) => {
        const mintsArray = (
          await Promise.all([
            realm.account.communityMint
              ? tryGetMint(connection, realm.account.communityMint)
              : undefined,
            realm.account.config?.councilMint
              ? tryGetMint(connection, realm.account.config.councilMint)
              : undefined,
          ])
        ).filter(Boolean);

        const realmMints = Object.fromEntries(
          mintsArray.map((m) => [m!.publicKey.toBase58(), m!.account]),
        );
        const realmMintPk = realm.account.communityMint;
        const realmMint = realmMints[realmMintPk.toBase58()];
        const realmCouncilMintPk = realm.account.config.councilMint;
        const realmCouncilMint =
          realmCouncilMintPk && realmMints[realmCouncilMintPk.toBase58()];
        const mints: RealmMints = {
          mint: realmMint,
          councilMint: realmCouncilMint,
        };
        return {
          ...realm,
          account: {
            ...realm.account,
            ...mints,
          },
        };
      }),
      (errors) =>
        `Failed to get ${errors.length} realm mint data, reasons: ${errors}`,
    );
    // const filtered = realmsWithMints.fulfilledResults.filter(
    //   (it) =>
    //     it.pubkey.toBase58() ===
    //       'AzCvN6DwPozJMhT7bSUok1C2wc4oAmYgm1wTo9vCKLap' ||
    //     it.pubkey.toBase58() === 'By2sVGZXwfQq6rAiAM3rNPJ9iQfb5e2QhnF4YjJ4Bip',
    // );
    return Object.fromEntries(
      // realmsWithMints.fulfilledResults.map((it) => [it.pubkey.toBase58(), it]),
    );
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
        // proposals.map((it) => {
        //   const account = it.account;
        //   account.state =
        //     Math.random() > 0.5
        //       ? ProposalState.Voting
        //       : ProposalState.Succeeded;
        //   return {
        //     ...it,
        //     account: account,
        //   };
        // }),
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

export async function tryGetMint(
  connection: Connection,
  publicKey: PublicKey,
): Promise<TokenProgramAccount<MintAccount> | undefined> {
  try {
    const result = await connection.getAccountInfo(publicKey);
    const data = Buffer.from(result!.data);
    const account = parseMintAccountData(data);
    return {
      publicKey,
      account,
    };
  } catch (ex) {
    console.warn(`Can't fetch mint ${publicKey?.toBase58()}`, ex);
  }
}

export function parseMintAccountData(data: Buffer) {
  const mintInfo = MintLayout.decode(data);
  if (mintInfo.mintAuthorityOption === 0) {
    mintInfo.mintAuthority = null;
  } else {
    mintInfo.mintAuthority = new PublicKey(mintInfo.mintAuthority);
  }

  mintInfo.supply = u64.fromBuffer(mintInfo.supply);
  mintInfo.isInitialized = mintInfo.isInitialized != 0;

  if (mintInfo.freezeAuthorityOption === 0) {
    mintInfo.freezeAuthority = null;
  } else {
    mintInfo.freezeAuthority = new PublicKey(mintInfo.freezeAuthority);
  }
  return mintInfo;
}

export const fmtTokenAmount = (c: BN, decimals?: number) =>
  c?.div(new BN(10).pow(new BN(decimals ?? 0))).toNumber() || 0;
