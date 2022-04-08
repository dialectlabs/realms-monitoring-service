import { PublicKey } from '@solana/web3.js';
import { DateTime } from 'luxon';
import { TokenAccount } from './tokenAccount';

export class SquadMember {
  publicKey;
  equityTokenAccount;
  tokens = 0;
  votingPower = 0;
  core = false;
  tokenAccount;

  constructor(fields: {
    publicKey: PublicKey;
    equityTokenAccount: PublicKey;
    tokens?: number;
    votingPower?: number;
    core?: boolean;
    tokenAccount?: TokenAccount | undefined;
  }) {
    this.publicKey = fields.publicKey;
    this.equityTokenAccount = fields.equityTokenAccount;
    this.tokens = fields.tokens ? fields.tokens : 0;
    this.votingPower = fields.votingPower ? fields.votingPower : 0;
    this.core = fields.core ? fields.core : false;
    this.tokenAccount = fields.tokenAccount ? fields.tokenAccount : undefined;
  }
}

export class Squad {
  isInitialized = false;
  open = false;
  emergencyLock = 0;

  // settings
  allocationType = 0;
  voteSupport = 0;
  voteQuorum = 0;
  coreThreshold = 0;
  squadName = '';
  description = '';
  token = '';
  // keys
  admin;
  solAccount;
  mintAddress;
  mintAccount;

  members;
  proposalNonce = 0;
  createdOn;
  solBalance = 0;
  pubkey;
  randomId;
  childIndex = 0;
  memberLock = 0;

  constructor(fields: {
    isInitialized: boolean;
    open: boolean;
    emergencyLock: number;
    allocationType: number;
    voteSupport: number;
    voteQuorum: number;
    coreThreshold: number;
    squadName: string;
    admin: PublicKey;
    solAccount: PublicKey;
    mintAddress: PublicKey;
    mintAccount: any;
    proposalNonce: number;
    createdOn: DateTime;
    members?: Array<SquadMember>;
    description: string;
    token: string;
    solBalance: number;
    pubkey: PublicKey;
    randomId: string;
    childIndex: number;
    memberLock: number;
  }) {
    this.isInitialized = fields.isInitialized;
    this.open = fields.open;
    this.emergencyLock = fields.emergencyLock;

    this.allocationType = fields.allocationType;
    this.voteSupport = fields.voteSupport;
    this.voteQuorum = fields.voteQuorum;
    this.coreThreshold = fields.coreThreshold;
    this.squadName = fields.squadName;
    this.description = fields.description;
    this.token = fields.token;
    this.admin = fields.admin;
    this.solAccount = fields.solAccount;
    this.mintAddress = fields.mintAddress;
    this.mintAccount = fields.mintAccount;
    this.proposalNonce = fields.proposalNonce;
    this.createdOn = fields.createdOn;
    this.members =
      fields.members && fields.members.length > 0
        ? fields.members
        : ([] as Array<SquadMember>);
    this.solBalance = fields.solBalance;
    this.pubkey = fields.pubkey;
    this.randomId = fields.randomId;
    this.childIndex = fields.childIndex;
    this.memberLock = fields.memberLock;
  }
}
