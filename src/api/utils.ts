import {
  AccountInfo,
  Commitment,
  Connection,
  PublicKey,
} from '@solana/web3.js';
//
// export type KnownTokenMap = Map<string, TokenInfo>;
//
// export const formatPriceNumber = new Intl.NumberFormat("en-US", {
//     style: "decimal",
//     minimumFractionDigits: 2,
//     maximumFractionDigits: 8,
// });
//
// // export function imageExists(url: string, callback: (arg0: boolean) => void) {
// //     const img = new Image();
// //     img.onload = () => { callback(true); };
// //     img.onerror = () => { callback(false); };
// //     img.src = url;
// // }
//
//
// // shorten the checksummed version of the input address to have 4 characters at start and end
// export function shortenAddress(address: string, chars = 4): string {
//     return `${address.slice(0, chars)}...${address.slice(-chars)}`;
// }
//
// export function shortenTextEnd(text: string, chars: number): string {
//     const cleanedText = text.replaceAll("\x00", "")
//     if (cleanedText.length > chars)
//         return `${cleanedText.substring(0, chars)}...`;
//     return cleanedText
// }
//
// export function getTokenName(
//     map: KnownTokenMap,
//     mint?: string | PublicKey,
//     shorten = true
// ): string {
//     const mintAddress = typeof mint === "string" ? mint : mint?.toBase58();
//
//     if (!mintAddress) {
//         return "N/A";
//     }
//
//     const knownSymbol = map.get(mintAddress)?.symbol;
//     if (knownSymbol) {
//         return knownSymbol;
//     }
//
//     return shorten ? `${mintAddress.substring(0, 5)}...` : mintAddress;
// }
//
// export function getTokenByName(tokenMap: KnownTokenMap, name: string) {
//     let token: TokenInfo | null = null;
//     // eslint-disable-next-line
//     for (const val of tokenMap.values()) {
//         if (val.symbol === name) {
//             token = val;
//             break;
//         }
//     }
//     return token;
// }
//
// export function getTokenIcon(
//     map: KnownTokenMap,
//     mintAddress?: string | PublicKey
// ): string | undefined {
//     const address =
//         typeof mintAddress === "string" ? mintAddress : mintAddress?.toBase58();
//     if (!address) {
//         return;
//     }
//
//     return map.get(address)?.logoURI;
// }
//
// export function isKnownMint(map: KnownTokenMap, mintAddress: string) {
//     return !!map.get(mintAddress);
// }
//
// export const STABLE_COINS = new Set(["USDC", "wUSDC", "USDT"]);
//
// export function chunks<T>(array: T[], size: number): T[][] {
//     return Array.apply<number, T[], T[][]>(
//         0,
//         new Array(Math.ceil(array.length / size))
//     ).map((_, index) => array.slice(index * size, (index + 1) * size));
// }
//
// export function toLamports(
//     account?: TokenAccount | number,
//     mint?: MintInfo
// ): number {
//     if (!account) {
//         return 0;
//     }
//
//     const amount =
//         typeof account === "number" ? account : account.info.amount?.toNumber();
//
//     const precision = 10 ** (mint?.decimals || 0);
//     return Math.floor(amount * precision);
// }
//
// export function wadToLamports(amount?: BN): BN {
//     return amount?.div(WAD) || ZERO;
// }
//
// export function fromLamports(
//     account?: TokenAccount | number | BN,
//     mint?: MintInfo,
//     // eslint-disable-next-line
//     rate: number = 1.0
// ): number {
//     if (!account) {
//         return 0;
//     }
//
//     const amount = Math.floor(
//         // eslint-disable-next-line
//         typeof account === "number"
//             ? account
//             : BN.isBN(account)
//                 ? account.toNumber()
//                 : account.info.amount.toNumber()
//     );
//
//     const precision = 10 ** ( mint?.decimals || 0);
//     return (amount / precision) * rate;
// }
//
// const SI_SYMBOL = ["", "k", "M", "G", "T", "P", "E"];
//
// const abbreviateNumber = (number: number, precision: number) => {
//     const tier = (Math.log10(number) / 3) | 0;
//     let scaled = number;
//     const suffix = SI_SYMBOL[tier];
//     if (tier !== 0) {
//         const scale = 10 ** ( tier * 3);
//         scaled = number / scale;
//     }
//
//     return scaled.toFixed(precision) + suffix;
// };
//
// export const formatAmount = (
//     val: number,
//     precision: number = 6,
//     abbr: boolean = true
// ) => (abbr ? abbreviateNumber(val, precision) : val.toFixed(precision));
//
// export function formatTokenAmount(
//     account?: TokenAccount,
//     mint?: MintInfo,
//     rate: number = 1.0,
//     prefix = "",
//     suffix = "",
//     precision = 6,
//     abbr = false
// ): string {
//     if (!account) {
//         return "";
//     }
//
//     return `${[prefix]}${formatAmount(
//         fromLamports(account, mint, rate),
//         precision,
//         abbr
//     )}${suffix}`;
// }
//
// export const formatUSD = new Intl.NumberFormat("en-US", {
//     style: "currency",
//     currency: "USD",
// });
//
// export const numberFormatter = new Intl.NumberFormat("en-US", {
//     style: "decimal",
//     minimumFractionDigits: 2,
//     maximumFractionDigits: 2,
// });
//
// export const memberTokenFormatter =  new Intl.NumberFormat("en-US", {
//     style: "decimal",
//     minimumFractionDigits: 0,
//     maximumFractionDigits: 0,
// });
//
// export const balanceFormatter = new Intl.NumberFormat("en-US", {
//     style: "decimal",
//     minimumFractionDigits: 2,
//     maximumFractionDigits: 5,
// });
//
// export const isSmallNumber = (val: number) => {
//     return val < 0.001 && val > 0;
// };
//
// export const formatNumber = {
//     format: (val?: number, useSmall?: boolean) => {
//         if (!val && val !== 0) {
//             return "--";
//         }
//         if (useSmall && isSmallNumber(val)) {
//             return 0.001;
//         }
//
//         return numberFormatter.format(val);
//     },
// };
//
// export const feeFormatter = new Intl.NumberFormat("en-US", {
//     style: "decimal",
//     minimumFractionDigits: 2,
//     maximumFractionDigits: 9,
// });
//
// export const formatPct = new Intl.NumberFormat("en-US", {
//     style: "percent",
//     minimumFractionDigits: 2,
//     maximumFractionDigits: 2,
// });
//
export async function getMultipleAccountsBatch(
  connection: Connection,
  publicKeys: PublicKey[],
  commitment?: Commitment,
): Promise<
  Array<null | { publicKey: PublicKey; account: AccountInfo<Buffer> }>
> {
  const keys: PublicKey[][] = [];
  let tempKeys: PublicKey[] = [];

  publicKeys.forEach((k) => {
    if (tempKeys.length >= 100) {
      keys.push(tempKeys);
      tempKeys = [];
    }
    tempKeys.push(k);
  });
  if (tempKeys.length > 0) {
    keys.push(tempKeys);
  }

  const accounts: Array<null | {
    executable: any;
    owner: PublicKey;
    lamports: any;
    data: Buffer;
  }> = [];

  const resArray: { [key: number]: any } = {};
  await Promise.all(
    keys.map(async (key, index) => {
      resArray[index] = await connection.getMultipleAccountsInfo(
        key,
        commitment,
      );
    }),
  );

  Object.keys(resArray)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .forEach((itemIndex) => {
      const res = resArray[parseInt(itemIndex, 10)];
      // eslint-disable-next-line no-restricted-syntax
      for (const account of res) {
        accounts.push(account);
      }
    });

  return accounts.map((account, idx) => {
    if (account === null) {
      return null;
    }
    return {
      publicKey: publicKeys[idx],
      account,
    };
  });
}

//
// export function generateRandomID(length: number) {
//     let result = '';
//     const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const charactersLength = characters.length;
//     for (let i = 0; i < length; i+=1) {
//         result += characters.charAt(Math.floor(Math.random() *
//             charactersLength));
//     }
//     return result;
// }
//
// export function convert(
//     account?: TokenAccount | number,
//     mint?: MintInfo,
//     rate: number = 1.0
// ): number {
//     if (!account) {
//         return 0;
//     }
//
//     const amount =
//         typeof account === "number" ? account : account.info.amount?.toNumber();
//
//     const precision = 10 ** ( mint?.decimals || 0);
//     const result = (amount / precision) * rate;
//
//     return result;
// }
