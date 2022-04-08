import * as borsh from 'borsh';
import BN from 'bn.js';
import { DateTime } from 'luxon';

import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';

import { getMultipleVoteAccounts } from './parseVote';
import { SquadProposal } from './proposal';
import SQUADS_PROGRAM_ID from './squadsProgram';
import { getMultipleAccountsBatch } from './utils';
import { VOTE_SEED } from './suffixes';

export class ProposalAccount {
  isInitialized = false;

  // settings
  proposalType = 0;
  executionAmount = 0;
  executionAmountOut = 0;
  executionSource;
  executionDestination;
  creator;
  squadAddress;
  title = '';
  description = '';
  link = '';
  votesNum = 0;
  hasVotedNum = 0;
  hasVoted;
  votes;
  votesLabels = Array<string>();
  startTimestamp: any;
  closeTimestamp: any;
  createdTimestamp = 0;
  supplyAtExecute = 0;
  membersAtExecute = 0;
  thresholdAtExecute = 0;
  executed = false;
  executeReady = false;
  executionDate: any;
  instructionIndex = 0;
  multipleChoice = false;
  proposalIndex = 0;
  executedBy;

  constructor(
    fields:
      | {
          isInitialized: boolean;
          proposalType: number;
          executionAmount: number;
          executionAmountOut: number;
          executionSource: PublicKey;
          executionDestination: PublicKey;
          creator: PublicKey;
          squadAddress: PublicKey;
          title: string;
          description: string;
          link: string;
          votesNum: number;
          hasVotedNum: number;
          hasVoted: Uint8Array;
          votes: Uint8Array;
          votesLabels: Array<string>;
          startTimestamp: DateTime;
          closeTimestamp: DateTime;
          createdTimestamp: number;
          supplyAtExecute: number;
          membersAtExecute: number;
          thresholdAtExecute: number;
          executed: boolean;
          executeReady: boolean;
          executionDate: DateTime;
          instructionIndex: number;
          multipleChoice: boolean;
          proposalIndex: number;
          executedBy: PublicKey;
        }
      | undefined = undefined,
  ) {
    if (fields) {
      this.isInitialized = fields.isInitialized;

      this.proposalType = fields.proposalType;
      this.executionAmount = fields.executionAmount;
      this.executionAmountOut = fields.executionAmountOut;
      this.executionSource = fields.executionSource;
      this.executionDestination = fields.executionDestination;
      this.creator = fields.creator;
      this.squadAddress = fields.squadAddress;
      this.title = fields.title;
      this.description = fields.description;
      this.link = fields.link;
      this.votesNum = fields.votesNum;
      this.hasVotedNum = fields.hasVotedNum;
      this.hasVoted = fields.hasVoted;
      this.votes = fields.votes;

      this.votesLabels = fields.votesLabels;
      this.startTimestamp = fields.startTimestamp;
      this.closeTimestamp = fields.closeTimestamp;
      this.createdTimestamp = fields.createdTimestamp;

      this.supplyAtExecute = fields.supplyAtExecute;
      this.membersAtExecute = fields.membersAtExecute;
      this.thresholdAtExecute = fields.thresholdAtExecute;

      this.executed = fields.executed;
      this.executeReady = fields.executeReady;
      this.executionDate = fields.executionDate;

      this.instructionIndex = fields.instructionIndex;
      this.multipleChoice = fields.multipleChoice;

      this.executedBy = fields.executedBy;
      this.proposalIndex = fields.proposalIndex;
    }
  }
}

export const parseProposal = async (
  connection: Connection,
  proposalInfo: AccountInfo<Buffer> | null,
  pubKey: PublicKey,
) => {
  const proposal = borsh.deserialize(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    ProposalSchema,
    ProposalAccount,
    proposalInfo!.data!,
  );
  const {
    isInitialized,
    proposalType,
    executionAmount,
    executionAmountOut,
    votesNum,
    executionSource,
    executionDestination,
    creator,
    squadAddress,
    hasVotedNum,
    hasVoted,
    votes,
    votesLabels,
    startTimestamp,
    closeTimestamp,
    createdTimestamp,
    supplyAtExecute,
    membersAtExecute,
    thresholdAtExecute,
    executed,
    executeReady,
    executionDate,
    instructionIndex,
    multipleChoice,
    executedBy,
    proposalIndex,
  } = proposal;

  const title = Buffer.from(proposal!.title!.slice(0, 36))
    .toString('utf8')
    .trim();
  const description = Buffer.from(proposal!.description!.slice(0, 496))
    .toString('utf8')
    .trim();
  const link = Buffer.from(proposal!.link!.slice(0, 48))
    .toString('utf8')
    .trim();

  const votesLabelsRaw = votesLabels.slice(0, 44 * votesNum);

  // TODO THIS PART IS WIP BUT SHOULDNT WORK RN
  const votedValues = [];

  for (let vi = 0; vi < 8 * votesNum; vi += 8) {
    const optionVote = Uint8Array.from(votes!.slice(vi, vi + 8));
    const dv = new DataView(optionVote.buffer, 0);
    const voteValue = dv.getUint32(0, true);
    votedValues.push(voteValue);
  }

  // const optionResults = [];
  // for (let oi = 0; oi < votesNum * 8; oi += 8) {
  //     const weightBuffer = Buffer.from(votes!.slice(oi, oi + 8));
  // }
  // let optionsValue = 0;
  // for (let vi = 0; vi < 3608; vi += 3608) {
  //     const optionVote = Buffer.from(votes.slice(vi, vi + 3608))
  //     const numberOfVotesArray = Uint8Array.from(optionVote.slice(0, 4));
  //     const numVoteView = new DataView(numberOfVotesArray.buffer,0);
  //     const numberOfVotes = numVoteView.getUint32(0,true);
  //     let count = 0;
  //     while (count < numberOfVotes) {
  //         const vote = optionVote.slice(count * 36, (count * 36) + 36);
  //         votedKeys.push({
  //             option: optionsValue,
  //             publicKeyString: new PublicKey(vote.slice(0, 32)).toBase58(),
  //             weight: new DataView(new Uint8Array(vote.slice(32, 36)).buffer).getFloat32(0, true)
  //         })
  //         count += 1;
  //     }
  //     optionsValue += 1;
  // }

  const votesLabelsParsed: string[] = [];
  // for (let vli = 0; vli < (44 * votesNum); vli += 44) {
  //     votesLabelsParsed.push(Buffer.from(votesLabelsRaw.slice(vli, vli + 44)).toString("utf8").trim());
  // }

  const formattedHasVoted = [];
  for (let vr = 4; vr < 32 * hasVotedNum; vr += 32) {
    const memberSlice = hasVoted!.slice(vr, vr + 32);
    const memberKey = new PublicKey(memberSlice);
    const [voteAccount] = await PublicKey.findProgramAddress(
      [pubKey.toBytes(), memberKey.toBytes(), Buffer.from(VOTE_SEED)],
      SQUADS_PROGRAM_ID.publicKey,
    );
    formattedHasVoted.push(voteAccount);
  }

  const voteRecords = await getMultipleVoteAccounts(
    connection,
    formattedHasVoted,
  );

  const formattedStartTime = DateTime.fromSeconds(
    new BN(startTimestamp, 'le').toNumber(),
  );
  const formattedCloseTime = DateTime.fromSeconds(
    new BN(closeTimestamp, 'le').toNumber(),
  );

  // const createdTimeNum = new BN(createdTimestamp).toNumber();
  const formattedCreatedTime = DateTime.fromSeconds(
    new BN(createdTimestamp, 'le').toNumber(),
  );

  const formattedExecutionDate = DateTime.fromSeconds(
    new BN(executionDate, 'le').toNumber(),
  );
  return new SquadProposal({
    isInitialized,
    proposalType,
    executionAmount,
    executionAmountOut,
    executionSource: new PublicKey(executionSource!),
    executionDestination: new PublicKey(executionDestination!),
    creator: new PublicKey(creator!),
    squadAddress: new PublicKey(squadAddress!),
    title,
    description,
    link,
    votesNum,
    votes: voteRecords,
    optionResults: votedValues,
    votesLabels: votesLabelsParsed,
    status: false,
    startTimestamp: formattedStartTime,
    closeTimestamp: formattedCloseTime,
    createdTimestamp: formattedCreatedTime,
    supplyAtExecute,
    membersAtExecute,
    thresholdAtExecute,
    executed,
    executeReady,
    executionDate: formattedExecutionDate,
    instructionIndex,
    multipleChoice,
    executedBy: new PublicKey(executedBy!),
    pubkey: pubKey,
    proposalIndex,
  });
};

export const getMultipleProposalAccounts = async (
  connection: Connection,
  pubkeys: PublicKey[],
) => {
  const proposals: AccountInfo<Buffer>[] = [];
  const rawProposals = await getMultipleAccountsBatch(connection, pubkeys);
  rawProposals.forEach((rawProposal, ind) => {
    if (rawProposal) proposals.push(rawProposal!.account);
    else pubkeys.splice(ind, 1);
  });
  const filteredProposals = proposals.filter((p) => p);
  return Promise.all(
    filteredProposals.map(
      async (s: AccountInfo<Buffer> | null, index: number) => {
        return parseProposal(connection, s, pubkeys[index]);
      },
    ),
  ).catch((err) => {
    throw new Error(err);
  });
};

export const getProposalAccountInfo = async (
  connection: Connection,
  pubKey: PublicKey,
) => {
  const proposalInfo = await connection.getAccountInfo(pubKey);
  if (!proposalInfo) {
    return new Error('proposalInfo not found');
  }

  // eslint-disable-next-line no-return-await
  return await parseProposal(connection, proposalInfo, pubKey);
};

export { SquadProposal };

/**
 * Borsh schema definition for squad accounts
 */
export const ProposalSchema = new Map([
  [
    ProposalAccount,
    {
      kind: 'struct',
      fields: [
        ['isInitialized', 'u8'], // 1 byte
        ['proposalType', 'u8'], // 1 byte
        ['executionAmount', 'u64'], // 8 bytes
        ['executionAmountOut', 'u64'], // 8 bytes
        ['executionSource', [32]], // 32 bytes
        ['executionDestination', [32]], // 32 bytes
        ['creator', [32]], // 32 bytes
        ['squadAddress', [32]], // 32 bytes

        ['title', [36]], // 36 bytes
        ['description', [496]], // 496 bytes
        ['link', [48]], // 48 bytes

        ['votesNum', 'u8'], // 1 byte
        ['hasVotedNum', 'u8'], // 1 byte
        ['hasVoted', [4804]], // 6404 bytes
        ['votes', [40]], // 40 bytes
        ['votesLabels', [220]], // 220 bytes
        ['startTimestamp', [8]], // 8 bytes
        ['closeTimestamp', [8]], // 8 bytes
        ['createdTimestamp', [8]], // 8 bytes
        ['supplyAtExecute', 'u64'], // 8 byte
        ['membersAtExecute', 'u8'], // 1 byte
        ['thresholdAtExecute', 'u8'], // 1 byte
        ['executed', 'u8'], // 1 byte
        ['executeReady', 'u8'], // 1 byte
        ['executionDate', [8]], // 8 bytes

        ['instructionIndex', 'u8'], // 1 byte
        ['multipleChoice', 'u8'], // 1 byte

        ['executedBy', [32]], // 32 byte
        ['proposalIndex', 'u32'],
        ['reserved', [128]],
      ],
    },
  ],
]);
