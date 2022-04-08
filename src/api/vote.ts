import { PublicKey } from '@solana/web3.js';
import { DateTime } from 'luxon';

export class Vote {
  isInitialized = false;

  proposalAddress;
  voteCast = 0;
  voter;
  castTimestamp;
  weight = 0;
  pubkey;

  constructor(
    fields:
      | {
          isInitialized: boolean;
          proposalAddress: PublicKey;
          voteCast: number;
          voter: PublicKey;
          castTimestamp: DateTime;
          weight: number;
          pubkey: PublicKey;
        }
      | undefined = undefined,
  ) {
    if (fields) {
      this.isInitialized = fields.isInitialized;

      this.proposalAddress = fields.proposalAddress;
      this.voteCast = fields.voteCast;
      this.voter = fields.voter;
      this.castTimestamp = fields.castTimestamp;
      this.weight = fields.weight;

      this.pubkey = fields.pubkey;
    }
  }
}
