import {
  AccountInfo,
  ConfirmedSignatureInfo,
  ConfirmedTransaction,
  ParsedAccountData,
  PublicKey,
} from '@solana/web3.js';
import { AccountLayout, MintInfo, MintLayout, u64 } from '@solana/spl-token';

import { TokenAccount } from './tokenAccount';
import { WRAPPED_SOL_MINT } from './ids';

// TODO: expose in spl package
const deserializeAccount = (data: Buffer) => {
  const accountInfo = AccountLayout.decode(data);
  accountInfo.mint = new PublicKey(accountInfo.mint);
  accountInfo.owner = new PublicKey(accountInfo.owner);
  accountInfo.amount = u64.fromBuffer(accountInfo.amount);

  if (accountInfo.delegateOption === 0) {
    accountInfo.delegate = null;
    // eslint-disable-next-line
    accountInfo.delegatedAmount = new u64(0);
  } else {
    accountInfo.delegate = new PublicKey(accountInfo.delegate);
    accountInfo.delegatedAmount = u64.fromBuffer(accountInfo.delegatedAmount);
  }

  accountInfo.isInitialized = accountInfo.state !== 0;
  accountInfo.isFrozen = accountInfo.state === 2;

  if (accountInfo.isNativeOption === 1) {
    accountInfo.rentExemptReserve = u64.fromBuffer(accountInfo.isNative);
    accountInfo.isNative = true;
  } else {
    accountInfo.rentExemptReserve = null;
    accountInfo.isNative = false;
  }

  if (accountInfo.closeAuthorityOption === 0) {
    accountInfo.closeAuthority = null;
  } else {
    accountInfo.closeAuthority = new PublicKey(accountInfo.closeAuthority);
  }

  return accountInfo;
};

// TODO: expose in spl package
const deserializeMint = (data: Buffer) => {
  if (data.length !== MintLayout.span) {
    throw new Error('Not a valid Mint');
  }

  const mintInfo = MintLayout.decode(data);

  if (mintInfo.mintAuthorityOption === 0) {
    mintInfo.mintAuthority = null;
  } else {
    mintInfo.mintAuthority = new PublicKey(mintInfo.mintAuthority);
  }

  mintInfo.supply = u64.fromBuffer(mintInfo.supply);
  mintInfo.isInitialized = mintInfo.isInitialized !== 0;

  if (mintInfo.freezeAuthorityOption === 0) {
    mintInfo.freezeAuthority = null;
  } else {
    mintInfo.freezeAuthority = new PublicKey(mintInfo.freezeAuthority);
  }

  return mintInfo as MintInfo;
};

const getMultipleAccountsCore = async (
  connection: any,
  keys: string[],
  commitment: string,
) => {
  const args = connection._buildArgs([keys], commitment, 'base64');

  const unsafeRes = await connection._rpcRequest('getMultipleAccounts', args);
  if (unsafeRes.error) {
    throw new Error(
      `failed to get info about account ${unsafeRes.error.message}`,
    );
  }

  if (unsafeRes.result.value) {
    const array = unsafeRes.result.value as AccountInfo<string[]>[];
    return { keys, array };
  }

  // TODO: fix
  throw new Error();
};

export interface ParsedLocalTransaction {
  transactionType: number;
  signature: ConfirmedSignatureInfo;
  confirmedTx: ConfirmedTransaction | null;
}

export interface ParsedAccountBase {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
  info: any; // TODO: change to unkown
}

export type AccountParser = (
  pubkey: PublicKey,
  data: AccountInfo<Buffer>,
) => ParsedAccountBase | undefined;

export interface ParsedAccount<T> extends ParsedAccountBase {
  info: T;
}

export const MintParser = (
  pubKey: PublicKey,
  info: AccountInfo<Buffer> | null,
) => {
  if (!info) {
    throw new Error('Missing account info buffer');
  }
  const buffer = Buffer.from(info.data);

  const data = deserializeMint(buffer);

  return {
    pubkey: pubKey,
    account: {
      ...info,
    },
    info: data,
  } as ParsedAccountBase;
};

export const TokenAccountParser = (
  pubKey: PublicKey,
  info: AccountInfo<Buffer | ParsedAccountData>,
) => {
  const buffer = Buffer.from(info.data as Buffer);
  const data = deserializeAccount(buffer);

  return {
    pubkey: pubKey,
    account: {
      ...info,
    },
    info: data,
  } as TokenAccount;
};

export const GenericAccountParser = (
  pubKey: PublicKey,
  info: AccountInfo<Buffer>,
) => {
  const buffer = Buffer.from(info.data);

  return {
    pubkey: pubKey,
    account: {
      ...info,
    },
    info: buffer,
  } as ParsedAccountBase;
};

export const keyToAccountParser = new Map<string, AccountParser>();

function wrapNativeAccount(
  pubkey: PublicKey,
  account?: AccountInfo<Buffer>,
): TokenAccount | undefined {
  if (!account) {
    return undefined;
  }

  return {
    pubkey,
    account,
    info: {
      address: pubkey,
      mint: WRAPPED_SOL_MINT,
      owner: pubkey,
      // eslint-disable-next-line
      amount: new u64(account.lamports),
      delegate: null,
      // eslint-disable-next-line
      delegatedAmount: new u64(0),
      isInitialized: true,
      isFrozen: false,
      isNative: true,
      rentExemptReserve: null,
      closeAuthority: null,
    },
  };
}
