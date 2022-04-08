import * as borsh from 'borsh';
import BN from 'bn.js';
import { DateTime } from 'luxon';

import {
  AccountInfo,
  Connection,
  ParsedAccountData,
  PublicKey,
} from '@solana/web3.js';

import { Vote } from './vote';

export class VoteAccount {
  isInitialized = false;

  proposalAddress;
  voteCast = 0;
  voter;
  castTimestamp: any;
  weight = 1;

  constructor(
    fields:
      | {
          isInitialized: boolean;
          proposalAddress: PublicKey;
          voteCast: number;
          voter: PublicKey;
          castTimestamp: DateTime;
          weight: number;
        }
      | undefined = undefined,
  ) {
    if (fields) {
      this.isInitialized = fields.isInitialized;

      this.proposalAddress = fields.proposalAddress;
      this.voteCast = fields.voteCast;
      this.voter = fields.voter;
      this.weight = fields.weight;
    }
  }
}

const parseVote = async (
  connection: Connection,
  voteInfo: AccountInfo<Buffer | ParsedAccountData> | null,
  pubKey: PublicKey,
) => {
  // console.log("parsing nftProposalInfo", nftProposalInfo);
  const nftVote = borsh.deserialize(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    VoteSchema,
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    VoteAccount,
    voteInfo!.data! as Buffer,
  );
  const {
    isInitialized,
    proposalAddress,
    voteCast,
    voter,
    castTimestamp,
    weight,
  } = nftVote;

  const formattedCastTimestamp = DateTime.fromSeconds(
    new BN(castTimestamp, 'le').toNumber(),
  );
  return new Vote({
    isInitialized,
    proposalAddress: new PublicKey(proposalAddress!),
    voteCast,
    voter: new PublicKey(voter!),
    castTimestamp: formattedCastTimestamp,
    weight,
    pubkey: pubKey,
  });
};

export const getMultipleVoteAccounts = async (
  connection: Connection,
  pubkeys: PublicKey[],
) => {
  const votes = await connection.getMultipleAccountsInfo(pubkeys);
  // eslint-disable-next-line no-return-await
  return Promise.all(
    votes.map(
      async (
        s: AccountInfo<Buffer | ParsedAccountData> | null,
        index: number,
      ) => {
        if (!s) {
          return null;
        }
        return parseVote(connection, s, pubkeys[index]);
      },
    ),
  ).catch((err) => {
    // eslint-disable-next-line no-console
    throw new Error(err);
  });
};

export const getVoteAccountInfo = async (
  connection: Connection,
  pubKey: PublicKey,
) => {
  const voteInfo = await connection.getAccountInfo(pubKey);
  if (!voteInfo) {
    return new Error('nftVoteInfo not found');
  }

  // eslint-disable-next-line no-return-await
  return await parseVote(connection, voteInfo, pubKey);
};

export { Vote };

/**
 * Borsh schema definition for nft vote accounts
 */
export const VoteSchema = new Map([
  [
    VoteAccount,
    {
      kind: 'struct',
      fields: [
        ['isInitialized', 'u8'],
        ['proposalAddress', [32]],
        ['voteCast', 'u8'],
        ['voter', [32]],
        ['castTimestamp', [8]],
        ['weight', 'u64'],

        ['reserved', [32]],
      ],
    },
  ],
]);
