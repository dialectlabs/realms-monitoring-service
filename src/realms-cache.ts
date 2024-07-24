import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { Interval } from 'luxon';
import {
  Governance,
  ProgramAccount,
  Proposal,
  ProposalState,
  Realm,
  TokenOwnerRecord,
} from '@solana/spl-governance';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MintLayout, RawMint } from '@solana/spl-token';
import * as BN from 'bn.js';
import {
  fetchGovernancePrograms,
  fetchGovernances,
  fetchProposals,
  fetchRealms,
  fetchRealmsWithMints,
  fetchTokenOwnerRecords,
} from './realms-sdk';
import { groupBy, keyBy } from 'lodash';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { retry } from './retry';

export interface CachingEvent {
  type: CachingEventType;
}

export interface InitialCachingFinished extends CachingEvent {
  type: CachingEventType.InitialCachingFinished;
}

export enum CachingEventType {
  InitialCachingFinished = 'caching.initial_finished',
}

export interface RealmMints {
  mint?: RawMint;
  councilMint?: RawMint;
}

@Injectable()
export class RealmsCache implements OnModuleInit {
  private readonly logger = new Logger(RealmsCache.name);

  // low freq data
  splGovernancePrograms: PublicKey[] = [];
  realms: Record<string, ProgramAccount<Realm & RealmMints>> = {};
  governancesByRealm: Record<string, ProgramAccount<Governance>[]> = {};
  tokenOwnerRecordsByRealm: Record<string, ProgramAccount<TokenOwnerRecord>[]> =
    {};
  tokenOwnerRecordsByPublickKey: Record<
    string,
    ProgramAccount<TokenOwnerRecord>
  > = {};

  // high freq data
  proposalsByRealm: Record<string, ProgramAccount<Proposal>[]> = {};

  staticAccountCachingInProgress = false;
  currentStaticAccountCachingStartedAt?: Date;
  lastStaticAccountCachingSuccessFinishedAt?: Date;

  dynamicAccountCachingInProgress = false;
  currentDynamicAccountCachingStartedAt?: Date;
  lastDynamicAccountCachingSuccessFinishedAt?: Date;

  isInitialized = false;
  initializationError?: Error;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    this.runInitialCacheAllAccounts().catch((e) => {
      this.initializationError = e;
      this.logger.error('Error during initial caching', e);
      this.logger.error(e);
    });
  }

  private async runInitialCacheAllAccounts() {
    const now = new Date();
    this.logger.log('Starting to cache all accounts');
    await this.cacheStaticAccounts();
    await this.cacheDynamicAccounts();
    this.logger.log(
      `Elapsed ${Interval.fromDateTimes(now, new Date()).toDuration(
        'seconds',
      )} to cache all accounts`,
    );
    this.isInitialized = true;
    const cachingFinishedEvent: InitialCachingFinished = {
      type: CachingEventType.InitialCachingFinished,
    };
    this.eventEmitter.emit(
      CachingEventType.InitialCachingFinished,
      cachingFinishedEvent,
    );
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'cacheStaticAccounts',
  })
  async periodicCacheStaticAccounts() {
    if (!this.isInitialized) {
      return;
    }
    await this.cacheStaticAccounts();
  }

  private async cacheStaticAccounts() {
    if (this.staticAccountCachingInProgress) {
      this.logger.warn(
        `Static account caching already in progress, started at ${this.currentStaticAccountCachingStartedAt}`,
      );
      return;
    }
    this.staticAccountCachingInProgress = true;
    try {
      await retry({
        func: async () => {
          await this.cacheGovernancePrograms();
          await this.cacheRealms();
          await this.cacheGovernances();
          await this.cacheTokenOwnerRecords();
        },
        maxRetries: 3,
        onError: (e) => {
          this.logger.error('Error during caching of static accounts');
          this.logger.error(e);
        },
      });
      this.lastStaticAccountCachingSuccessFinishedAt = new Date();
    } finally {
      this.staticAccountCachingInProgress = false;
      this.currentStaticAccountCachingStartedAt = undefined;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: 'cacheDynamicAccounts',
  })
  async periodicCacheDynamicAccounts() {
    if (!this.isInitialized) {
      return;
    }
    await this.cacheDynamicAccounts();
  }

  private async cacheDynamicAccounts() {
    if (this.dynamicAccountCachingInProgress) {
      this.logger.warn(
        `Dynamic account caching already in progress, started at ${this.currentDynamicAccountCachingStartedAt}`,
      );
      return;
    }
    this.dynamicAccountCachingInProgress = true;
    try {
      await retry({
        func: async () => {
          await this.cacheProposals();
        },
        maxRetries: 3,
        onError: (e) => {
          this.logger.error('Error during caching of dynamic accounts');
          this.logger.error(e);
        },
      });
      this.lastDynamicAccountCachingSuccessFinishedAt = new Date();
    } finally {
      this.dynamicAccountCachingInProgress = false;
      this.currentDynamicAccountCachingStartedAt = undefined;
    }
  }

  private async cacheGovernancePrograms() {
    const now = new Date();
    this.logger.log('Starting to cache governance programs');
    this.splGovernancePrograms = await fetchGovernancePrograms();
    this.logger.log(
      `Elapsed ${Interval.fromDateTimes(now, new Date()).toDuration(
        'seconds',
      )} to cache ${this.splGovernancePrograms.length} governance programs`,
    );
  }

  private async cacheRealms() {
    const now = new Date();
    this.logger.log('Starting to cache realms');
    const realms = await fetchRealms(this.splGovernancePrograms);
    const realmsWithMints = await fetchRealmsWithMints(realms);
    const realmsByAddress = Object.fromEntries(
      realmsWithMints.map((it) => [it.pubkey.toBase58(), it]),
    );
    this.realms = Object.assign(this.realms, realmsByAddress);
    this.logger.log(
      `Elapsed ${Interval.fromDateTimes(now, new Date()).toDuration(
        'seconds',
      )} to cache ${realmsWithMints.length} realms`,
    );
  }

  private async cacheGovernances() {
    const now = new Date();
    this.logger.log('Starting to cache governances');
    const governances = await fetchGovernances(this.splGovernancePrograms);
    const governancesByRealm = groupBy(governances, (it) =>
      it.account.realm.toBase58(),
    );
    this.governancesByRealm = Object.assign(
      this.governancesByRealm,
      governancesByRealm,
    );
    this.logger.log(
      `Elapsed ${Interval.fromDateTimes(now, new Date()).toDuration(
        'seconds',
      )} to cache ${governances.length} governances`,
    );
  }

  private async cacheTokenOwnerRecords() {
    const now = new Date();
    this.logger.log('Starting to cache token owner records');
    const tokenOwnerRecords = await fetchTokenOwnerRecords(
      this.splGovernancePrograms,
    );

    Object.assign(
      this.tokenOwnerRecordsByPublickKey,
      keyBy(tokenOwnerRecords, (it) => it.pubkey.toBase58()),
    );
    const grouped = groupBy(tokenOwnerRecords, (it) =>
      it.account.realm.toBase58(),
    );
    this.tokenOwnerRecordsByRealm = Object.assign(
      this.tokenOwnerRecordsByRealm,
      grouped,
    );
    this.logger.log(
      `Elapsed ${Interval.fromDateTimes(now, new Date()).toDuration(
        'seconds',
      )} to cache ${tokenOwnerRecords.length} token owner records`,
    );
  }

  private async cacheProposals() {
    const now = new Date();
    this.logger.log('Starting to cache proposals');
    const proposals = (await fetchProposals(this.splGovernancePrograms)).filter(
      (it) => it.account.state !== ProposalState.Draft,
    );
    const proposalsByGovernance = groupBy(proposals, (it) =>
      it.account.governance.toBase58(),
    );
    const proposalsByRealm = Object.fromEntries(
      Object.keys(this.realms).map((realm) => {
        const governances = this.governancesByRealm[realm] ?? [];
        const proposals = governances.flatMap(
          (governance) =>
            proposalsByGovernance[governance.pubkey.toBase58()] ?? [],
        );
        return [realm, proposals];
      }),
    );
    this.proposalsByRealm = Object.assign(
      this.proposalsByRealm,
      proposalsByRealm,
    );
    this.logger.log(
      `Elapsed ${Interval.fromDateTimes(now, new Date()).toDuration(
        'seconds',
      )} to cache ${proposals.length} proposals`,
    );
  }
}

export function parseMintAccountData(data: Buffer) {
  return MintLayout.decode(data);
}

export const fmtTokenAmount = (c: BN, decimals?: number) =>
  c?.div(new BN(10).pow(new BN(decimals ?? 0))).toNumber() || 0;
