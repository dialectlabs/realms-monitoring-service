import { PublicKey } from '@solana/web3.js';

const SQUADS_PROGRAM_ID = (() => {
  // const pa = window.SQDS_PROGRAM;
  const pa: any = { program_id: process.env.REACT_APP_SQUADS_PROGRAM_ID };
  return {
    publicKey: new PublicKey('og295qHEFgcX6WyaMLKQPwDMdMxuHoXe7oQ7ywwyRMo'),
  };
})();

export default SQUADS_PROGRAM_ID;
