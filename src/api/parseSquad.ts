import * as borsh from 'borsh';
import { DateTime } from 'luxon';

import {
  AccountInfo,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';

import { TokenAccountParser } from './accounts';

import { Squad, SquadMember } from './squad';

import SQUAD_PROGRAM_ID from './squadsProgram';
import { getMultipleAccountsBatch } from './utils';
import { SOL_SEED } from './suffixes';
import BN from 'bn.js';

export const INIT_BYTES = 1;
export const SQUAD_REV_SHARE_BYTES = 1;
export const SQUAD_VOTE_MODEL_BYTES = 1;
export const SQUAD_VOTE_RULES_SUPPORT_BYTES = 1;
export const SQUAD_VOTE_RULES_QUORUM_BYTES = 1;
export const SOL_ACCOUNT_BYTES = 32;
export const MINT_BYTES = 32;
export const MEMBER_SIZE = 64;
export const SQUAD_NUM_MEMBERS = 150;
export const MEMBER_SPACE = MEMBER_SIZE * SQUAD_NUM_MEMBERS + 4;
export const MEMBER_MAP_SIZE = 4;
export const MEMBER_EQUITY_ACCOUNT_KEY_SIZE = 32;
export const PUBLIC_KEY_BYTES = 32;

export const CREATE_SQUAD_SIZE =
  INIT_BYTES +
  SQUAD_REV_SHARE_BYTES +
  SQUAD_VOTE_MODEL_BYTES +
  SQUAD_VOTE_RULES_QUORUM_BYTES +
  SQUAD_VOTE_RULES_SUPPORT_BYTES +
  SOL_ACCOUNT_BYTES +
  MINT_BYTES +
  MEMBER_MAP_SIZE +
  MEMBER_SPACE;

const getMultipleGovernanceAccounts = async (
  connection: Connection,
  pubkeys: PublicKey[],
) => {
  const govAccounts = await connection.getMultipleAccountsInfo(pubkeys);
  return govAccounts.map((a, i) => {
    return TokenAccountParser(pubkeys[i], a!);
  });
};

export const parseMultisig = async (
  connection: Connection,
  squadInfo: AccountInfo<Buffer> | null,
  pubKey: PublicKey,
) => {
  try {
    const squad = borsh.deserialize(
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      SquadSchema,
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      SquadAccount,
      squadInfo!.data!,
    );

    const {
      admin,
      allocationType,
      coreThreshold,
      isInitialized,
      emergencyLock,
      mintAddress,
      open,
      solAccount,
      voteQuorum,
      voteSupport,
      proposalNonce,
      childIndex,
      createdOn,
      memberLock,
    } = squad;

    const rawMembers = squad.members || [];
    const memberObjs = [];
    let members: Array<SquadMember> = [];

    const squadName = Buffer.from(squad!.squadName!.slice(0, 24))
      .toString('utf8')
      .replace(new RegExp('\u0000', 'g'), '')
      .trim();
    const squadDescription = Buffer.from(squad!.description!.slice(0, 36))
      .toString('utf8')
      .trim();
    const squadToken = Buffer.from(squad!.token!.slice(0, 6))
      .toString('utf8')
      .trim();

    const randomId = Buffer.from(squad!.randomId!.slice(0, 10))
      .toString('utf8')
      .trim();

    // total bytes for the members
    const membersByteLengthArray = Uint8Array.from(rawMembers.slice(0, 4));
    const totalMembersByteArray = Uint8Array.from(rawMembers.slice(4, 8));
    const viewTotal = new DataView(membersByteLengthArray.buffer, 0);
    const viewNumber = new DataView(totalMembersByteArray.buffer, 0);

    const membersByteLength = viewTotal.getUint32(0, true);
    const membersLength = viewNumber.getUint32(0, true);

    const memberBytes = Uint8Array.from(
      rawMembers.slice(0, membersByteLength + 4),
    );
    if (membersByteLength > 0) {
      const memberMap = memberBytes!.slice(8, membersLength * 64 + 8);
      // slice of the actual used members array
      let member;
      for (let i = 0; i < memberMap.length; i += 64) {
        member = memberMap.slice(i, i + 64);
        memberObjs.push(member);
      }

      members = memberObjs.map((m) => {
        const mPubKey = new PublicKey(m.slice(0, 32));
        const mEquityKey = new PublicKey(m.slice(32));

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new SquadMember({
          publicKey: mPubKey,
          equityTokenAccount: mEquityKey,
        });
      });

      members = members.map((m) => {
        return new SquadMember({
          publicKey: m.publicKey!,
          equityTokenAccount: m.equityTokenAccount!,
          tokenAccount: undefined,
          tokens: 1,
          votingPower: 1,
          core: true,
        });
      });
    }

    const createdTimeNum = new BN(createdOn).toNumber();
    const formattedCreatedTime = DateTime.fromSeconds(createdTimeNum);
    const [squadSolAccount] = await PublicKey.findProgramAddress(
      [pubKey.toBytes(), Buffer.from(SOL_SEED)],
      SQUAD_PROGRAM_ID.publicKey,
    );
    const solInfo = await connection.getBalance(squadSolAccount!);
    return new Squad({
      isInitialized,
      open,
      emergencyLock,
      allocationType,
      voteSupport,
      voteQuorum,
      coreThreshold,
      squadName,
      description: squadDescription,
      token: squadToken,
      admin: new PublicKey(admin!),
      solAccount: new PublicKey(solAccount!),
      mintAddress: new PublicKey(mintAddress!),
      mintAccount: null,
      members,
      proposalNonce,
      createdOn: formattedCreatedTime,
      solBalance: solInfo / LAMPORTS_PER_SOL,
      pubkey: pubKey,
      randomId,
      childIndex,
      memberLock,
    });
  } catch (e) {
    return null;
  }
};

export const parseSquad = async (
  connection: Connection,
  squadInfo: AccountInfo<Buffer> | null,
  pubKey: PublicKey,
) => {
  try {
    const squad = borsh.deserialize(
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      SquadSchema,
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      SquadAccount,
      squadInfo!.data!,
    );

    const {
      admin,
      allocationType,
      coreThreshold,
      isInitialized,
      emergencyLock,
      mintAddress,
      open,
      solAccount,
      voteQuorum,
      voteSupport,
      proposalNonce,
      createdOn,
      childIndex,
      memberLock,
    } = squad;

    const rawMembers = squad.members || [];
    const memberObjs = [];
    let members: Array<SquadMember> = [];

    const squadName = Buffer.from(squad!.squadName!.slice(0, 24))
      .toString('utf8')
      .replace(new RegExp('\u0000', 'g'), '')
      .trim();

    const squadDescription = Buffer.from(squad!.description!.slice(0, 36))
      .toString('utf8')
      .trim();
    const squadToken = Buffer.from(squad!.token!.slice(0, 6))
      .toString('utf8')
      .trim();

    const randomId = Buffer.from(squad!.randomId!.slice(0, 10))
      .toString('utf8')
      .trim();

    // mint info
    // const mintAccountInfo = await connection.getAccountInfo(new PublicKey(mintAddress!));
    // const mintAccount = MintParser(new PublicKey(mintAddress!), mintAccountInfo);
    // const mintSupply = mintAccount.info.supply.toNumber();

    // total bytes for the members
    const membersByteLengthArray = Uint8Array.from(rawMembers.slice(0, 4));
    // console.log("memberByteLengthArray", membersByteLengthArray);
    const totalMembersByteArray = Uint8Array.from(rawMembers.slice(4, 8));
    // console.log("totalMembersByteArray", totalMembersByteArray);
    const viewTotal = new DataView(membersByteLengthArray.buffer, 0);
    const viewNumber = new DataView(totalMembersByteArray.buffer, 0);

    const membersByteLength = viewTotal.getUint32(0, true);
    const membersLength = viewNumber.getUint32(0, true);

    const memberBytes = Uint8Array.from(
      rawMembers.slice(0, membersByteLength + 4),
    );
    // console.log("totalMembers", membersLength );
    if (membersByteLength > 0) {
      const memberMap = memberBytes!.slice(8, membersLength * 64 + 8);
      // slice of the actual used members array
      let member;
      for (let i = 0; i < memberMap.length; i += 64) {
        member = memberMap.slice(i, i + 64);
        memberObjs.push(member);
      }

      members = memberObjs.map((m) => {
        const mPubKey = new PublicKey(m.slice(0, 32));
        const mEquityKey = new PublicKey(m.slice(32));

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new SquadMember({
          publicKey: mPubKey,
          equityTokenAccount: mEquityKey,
        });
      });

      const govTokens = await getMultipleGovernanceAccounts(
        connection,
        members.map((m) => m.equityTokenAccount!),
      );
      members = members.map((m, i) => {
        // const tokens = govTokens[i].info.amount.toNumber();
        // const votingPower = parseFloat(((tokens / mintSupply) * 1000 / 10).toFixed(2));

        return new SquadMember({
          publicKey: m.publicKey!,
          equityTokenAccount: m.equityTokenAccount!,
          tokenAccount: govTokens[i]!,
        });
      });
    }

    const createdTimeNum = new BN(createdOn).toNumber();
    const formattedCreatedTime = DateTime.fromSeconds(createdTimeNum);
    const [squadSolAccount] = await PublicKey.findProgramAddress(
      [pubKey.toBytes(), Buffer.from(SOL_SEED)],
      SQUAD_PROGRAM_ID.publicKey,
    );
    const solInfo = await connection.getBalance(squadSolAccount!);
    return new Squad({
      isInitialized,
      open,
      emergencyLock,
      allocationType,
      voteSupport,
      voteQuorum,
      coreThreshold,
      squadName,
      description: squadDescription,
      token: squadToken,
      admin: new PublicKey(admin!),
      solAccount: new PublicKey(solAccount!),
      mintAddress: new PublicKey(mintAddress!),
      mintAccount: null,
      members,
      proposalNonce,
      createdOn: formattedCreatedTime,
      solBalance: solInfo / LAMPORTS_PER_SOL,
      pubkey: pubKey,
      randomId,
      childIndex,
      memberLock,
    });
  } catch (e) {
    return null;
  }
};

export const getMultipleSquadAccounts = async (
  connection: Connection,
  pubkeys: PublicKey[],
) => {
  const squads: AccountInfo<Buffer>[] = [];
  const rawSquads = await getMultipleAccountsBatch(connection, pubkeys);
  rawSquads.forEach((rawSquad, ind) => {
    if (rawSquad) {
      squads.push(rawSquad!.account);
    } else {
      pubkeys.splice(ind, 1);
    }
  });
  const validSquads: Squad[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const s of squads) {
    if (s?.owner.toBase58() === SQUAD_PROGRAM_ID.publicKey.toBase58()) {
      const index = squads.indexOf(s);
      const parsed =
        s.data[3] === 1
          ? await parseSquad(connection, s, pubkeys[index])
          : await parseMultisig(connection, s, pubkeys[index]);
      if (parsed) validSquads.push(parsed);
    }
  }
  return validSquads;
};

export const getSquadAccountInfo = async (
  connection: Connection,
  pubKey: PublicKey,
) => {
  const squadInfo = await connection.getAccountInfo(pubKey);
  if (!squadInfo) {
    return null;
  }

  // eslint-disable-next-line no-return-await
  return squadInfo.data[3] === 1
    ? await parseSquad(connection, squadInfo, pubKey)
    : await parseMultisig(connection, squadInfo, pubKey);
};

export class SquadAccount {
  isInitialized = false;
  open = false;
  emergencyLock = 0;

  // settings
  allocationType = 0;
  voteSupport = 0;
  voteQuorum = 0;
  coreThreshold = 0;
  // squadNameLength;
  squadName;
  description;
  token;
  fs1 = 0;
  fs2 = 0;
  fs3 = 0;
  fs4 = 0;
  fs5 = 0;

  // keys
  admin;
  solAccount;
  mintAddress;
  fa1;
  fa2;
  fa3;
  fa4;
  fa5;
  proposalNonce = 0;
  createdOn = 0;
  members;
  randomId;
  childIndex = 0;
  memberLock = 0;

  constructor(
    fields:
      | {
          isInitialized: boolean;
          open: boolean;
          emergencyLock: number;
          allocationType: number;
          voteSupport: number;
          voteQuorum: number;
          coreThreshold: number;
          // squadNameLength: Uint8Array,
          squadName: Uint8Array;
          description: Uint8Array;
          token: Uint8Array;
          fs1: number;
          fs2: number;
          fs3: number;
          fs4: number;
          fs5: number;

          admin: Uint8Array;
          solAccount: Uint8Array;
          mintAddress: Uint8Array;
          fa1: Uint8Array;
          fa2: Uint8Array;
          fa3: Uint8Array;
          fa4: Uint8Array;
          fa5: Uint8Array;

          proposalNonce: number;
          createdOn: number;
          members: Uint8Array;
          randomId: string;
          childIndex: number;
          memberLock: number;
        }
      | undefined = undefined,
  ) {
    if (fields) {
      this.isInitialized = fields.isInitialized;
      this.open = fields.open;
      this.emergencyLock = fields.emergencyLock;
      this.allocationType = fields.allocationType;
      this.voteSupport = fields.voteSupport;
      this.voteQuorum = fields.voteQuorum;
      this.coreThreshold = fields.coreThreshold;
      // this.squadNameLength = fields.squadNameLength;
      this.squadName = fields.squadName;
      this.description = fields.description;
      this.token = fields.token;
      this.fs1 = fields.fs1;
      this.fs2 = fields.fs2;
      this.fs3 = fields.fs3;
      this.fs4 = fields.fs4;
      this.fs5 = fields.fs5;

      this.admin = fields.admin;
      this.solAccount = fields.solAccount;
      this.mintAddress = fields.mintAddress;
      this.fa1 = fields.fa1;
      this.fa2 = fields.fa2;
      this.fa3 = fields.fa3;
      this.fa4 = fields.fa4;
      this.fa5 = fields.fa5;
      this.proposalNonce = fields.proposalNonce;
      this.createdOn = fields.createdOn;
      this.members = fields.members;
      this.randomId = fields.randomId;
      this.childIndex = fields.childIndex;
      this.memberLock = fields.memberLock;
    }
  }
}

export { Squad, SquadMember };

/**
 * Borsh schema definition for squad accounts
 */
export const SquadMemberSchema = new Map([
  [
    SquadMember,
    {
      kind: 'struct',
      fields: [['equityTokenAccount', [MEMBER_EQUITY_ACCOUNT_KEY_SIZE]]],
    },
  ],
]);

/**
 * Borsh schema definition for squad accounts
 */
export const SquadSchema = new Map([
  [
    SquadAccount,
    {
      kind: 'struct',
      fields: [
        // 7020 total

        // 3 bytes
        ['isInitialized', 'u8'],
        ['open', 'u8'],
        ['emergencyLock', 'u8'],

        // 4 bytes
        ['allocationType', 'u8'],
        ['voteSupport', 'u8'],
        ['voteQuorum', 'u8'],
        ['coreThreshold', 'u8'],

        // 28 bytes
        // ['squadNameLength', [4]],
        ['squadName', [24]],
        ['description', [36]],
        ['token', [6]],
        // 5 bytes
        ['fs1', 'u8'],
        ['fs2', 'u8'],
        ['fs3', 'u8'],
        ['fs4', 'u8'],
        ['fs5', 'u8'],

        // 256 bytes
        ['admin', [PUBLIC_KEY_BYTES]],
        ['mintAddress', [PUBLIC_KEY_BYTES]],
        ['solAccount', [PUBLIC_KEY_BYTES]],

        ['fa1', [PUBLIC_KEY_BYTES]],
        ['fa2', [PUBLIC_KEY_BYTES]],
        ['fa3', [PUBLIC_KEY_BYTES]],
        ['fa4', [PUBLIC_KEY_BYTES]],
        ['fa5', [PUBLIC_KEY_BYTES]],

        // 4 bytes
        ['proposalNonce', 'u32'],
        // 8 bytes
        ['createdOn', 'u64'],

        // 6408 bytes
        ['members', [MEMBER_MAP_SIZE + MEMBER_SPACE]],

        ['randomId', [10]],

        ['childIndex', 'u32'],
        ['memberLock', 'u32'],
        ['reserved', [256]],
      ],
    },
  ],
]);
