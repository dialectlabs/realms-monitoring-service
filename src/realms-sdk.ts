import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import {
  getAccountTypes,
  getBorshProgramAccounts,
  getGovernanceSchemaForAccount,
  Governance,
  GovernanceAccount,
  GovernanceAccountClass,
  MemcmpFilter,
  ProgramAccount,
  Proposal,
  Realm,
  TokenOwnerRecord,
} from '@solana/spl-governance';
import { RealmsRestService } from './realms-rest-service';
import { HttpService } from '@nestjs/axios';
import { chunk, compact, keyBy, uniqBy, zip } from 'lodash';
import { parseMintAccountData } from './realms-cache';
import { sleepSecs } from 'twitter-api-v2/dist/v1/media-helpers.v1';

const connection = new Connection(process.env.DIALECT_SDK_SOLANA_RPC_URL!);

const realmsRestService = new RealmsRestService(new HttpService());

export async function fetchGovernancePrograms() {
  const programs = await realmsRestService.getSplGovernancePrograms();
  return programs;
}

export async function fetchRealms(governancePrograms: PublicKey[]) {
  const acc: ProgramAccount<Realm>[] = [];
  for (const splGovernanceProgram of governancePrograms) {
    await sleepSecs(1);
    const governanceAccounts: ProgramAccount<Realm>[] =
      await getGovernanceAccounts(connection, splGovernanceProgram, Realm, []);
    acc.push(...governanceAccounts);
  }
  return acc;
}

export async function fetchGovernances(governancePrograms: PublicKey[]) {
  const acc: ProgramAccount<Governance>[] = [];
  for (const splGovernanceProgram of governancePrograms) {
    await sleepSecs(1);
    const governanceAccounts: ProgramAccount<Governance>[] =
      await getGovernanceAccounts(
        connection,
        splGovernanceProgram,
        Governance,
        [],
      );
    acc.push(...governanceAccounts);
  }
  return acc;
}

export async function fetchProposals(governancePrograms: PublicKey[]) {
  const acc: ProgramAccount<Proposal>[] = [];
  for (const splGovernanceProgram of governancePrograms) {
    await sleepSecs(1);
    const governanceAccounts: ProgramAccount<Proposal>[] =
      await getGovernanceAccounts(
        connection,
        splGovernanceProgram,
        Proposal,
        [],
      );
    acc.push(...governanceAccounts);
  }
  return acc;
}

export async function fetchRealmsWithMints(realms: ProgramAccount<Realm>[]) {
  const communityMints = realms.map((it) => it.account.communityMint);
  const councilMints = realms.map((it) => it.account.config.councilMint);
  const mints = uniqBy(
    [...compact(communityMints), ...compact(councilMints)],
    (it) => it.toBase58(),
  );

  const accInfoAcc: (AccountInfo<Buffer> | null)[] = [];
  const chunkedMints = chunk(mints, 100);
  for (const chunked of chunkedMints) {
    await sleepSecs(1);
    const multipleAccountsInfo = await connection.getMultipleAccountsInfo(
      chunked,
    );
    accInfoAcc.push(...multipleAccountsInfo);
  }
  const mintAccounts = compact(accInfoAcc);

  if (mints.length !== mintAccounts.length) {
    console.warn(
      `Expected to fetch ${mints.length} mint accounts, but got ${mintAccounts.length}`,
    );
  }

  const parsedRawMints = keyBy(
    compact(
      zip(mints, mintAccounts).map(([address, buffer]) => {
        if (!address || !buffer) {
          return null;
        }
        const data = Buffer.from(buffer.data);
        const parsed = parseMintAccountData(data);
        return {
          address,
          parsed,
        };
      }),
    ),
    (it) => it.address.toBase58(),
  );

  const realmsWithMints = realms.map((it) => ({
    ...it,
    mints: {
      mint: parsedRawMints[it.account.communityMint.toBase58()]?.parsed,
      councilMint:
        it.account.config.councilMint &&
        parsedRawMints[it.account.config.councilMint.toBase58()]?.parsed,
    },
  }));

  return realmsWithMints;
}

export async function fetchTokenOwnerRecords(governancePrograms: PublicKey[]) {
  const acc: ProgramAccount<TokenOwnerRecord>[] = [];
  for (const splGovernanceProgram of governancePrograms) {
    await sleepSecs(1);
    const governanceAccounts: ProgramAccount<TokenOwnerRecord>[] =
      await getGovernanceAccounts(
        connection,
        splGovernanceProgram,
        TokenOwnerRecord,
        [],
      );
    for (const ga of governanceAccounts) {
      acc.push(ga);
    }
  }
  return acc;
}

export async function getGovernanceAccounts<TAccount extends GovernanceAccount>(
  connection: Connection,
  programId: PublicKey,
  accountClass: new (args: any) => TAccount,
  filters: MemcmpFilter[] = [],
) {
  const accountTypes = getAccountTypes(
    accountClass as any as GovernanceAccountClass,
  );

  const all: ProgramAccount<TAccount>[] = [];

  for (const accountType of accountTypes) {
    const accounts = await getBorshProgramAccounts(
      connection,
      programId,
      (at) => getGovernanceSchemaForAccount(at),
      accountClass,
      filters,
      accountType,
    );

    for (const account of accounts) {
      all.push(account);
    }
  }

  return all;
}
