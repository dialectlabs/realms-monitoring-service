import { DateTime } from 'luxon';
import { PublicKey } from '@solana/web3.js';
import { Vote } from './vote';

export const CREATE_PROPOSAL_SIZE = 6002;

export interface ProposalListItemModel {
  proposalPubkey: PublicKey;
  pubkey: PublicKey;
  title: string;
  description: string;
  status: number;
  proposalType: number;
  executed: boolean;
  optionResults: any;
  votes: any;
  startTimestamp: DateTime;
  closeTimestamp: DateTime;
  creator: PublicKey;
  createdTimestamp?: DateTime;
  executeReady: boolean;
  executionAmount: number;
  proposalIndex: number;
}

export class SquadProposal {
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
  optionResults;
  votes = Array<Vote>();
  votesLabels = Array<string>();
  startTimestamp: any;
  closeTimestamp: any;
  createdTimestamp;
  supplyAtExecute = 0;
  membersAtExecute = 0;
  thresholdAtExecute = 0;
  executed = false;
  executeReady = false;
  executionDate: any;
  instructionIndex = 0;
  multipleChoice = false;
  executedBy;
  status = false;
  pubkey;
  proposalIndex = 0;

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
          optionResults: Array<number>;
          votes: any;
          votesLabels: Array<string>;
          startTimestamp: DateTime;
          closeTimestamp: DateTime;
          createdTimestamp: DateTime;
          supplyAtExecute: number;
          membersAtExecute: number;
          thresholdAtExecute: number;
          executed: boolean;
          executeReady: boolean;
          executionDate: DateTime;
          instructionIndex: number;
          multipleChoice: boolean;
          executedBy: PublicKey;
          pubkey: PublicKey;
          status: boolean;
          proposalIndex: number;
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
      this.pubkey = fields.pubkey;
      this.title = fields.title;
      this.status = fields.status;
      this.optionResults = fields.optionResults;

      this.instructionIndex = fields.instructionIndex;
      this.multipleChoice = fields.multipleChoice;

      this.executedBy = fields.executedBy;
      this.proposalIndex = fields.proposalIndex;
    }
  }

  isClosed() {
    return DateTime.now().toUTC() >= this.closeTimestamp;
  }

  isOpen() {
    return (
      DateTime.now().toUTC() > this.startTimestamp &&
      DateTime.now().toUTC() < this.closeTimestamp &&
      !this.executed
    );
  }

  totalVotes() {
    return this.votes.length;
  }
}
