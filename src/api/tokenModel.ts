export interface TokenModel {
  amount: number;
  source: string;
  mint: string;
  symbol: string;
  decimals: number;
  logoUri?: string;
  name?: string;
}
