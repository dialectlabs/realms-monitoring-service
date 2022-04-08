import { programs } from '@metaplex/js';
import { PublicKey } from '@solana/web3.js';
import { TokenModel } from './tokenModel';

export interface VaultNFT {
  account: PublicKey;
  metadata: programs.metadata.Metadata;
  tokenModel: TokenModel;
}
