import { getRealms, getAllProposals } from '@solana/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';
import { connect } from 'http2';

async function run() {
  const PROVIDER_URL =
  'https://solana-api.syndica.io/access-token/6sW38nSZ1Qm4WVRN4Vnbjb9EF2QudlpGZBToMtPyqoXqkIenDwJ5FVK1HdWSqqah/rpc';
  const connection = new Connection(PROVIDER_URL);
  const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

  const realms = await getRealms(connection, programId);

  for (const realm of realms) {
    console.log("name: ", realm.account.name);
    console.log("accountType: ", realm.account.accountType);
    console.log("votingProposalCount: ", realm.account.votingProposalCount);
    console.log("realm all: ", realm);

    const proposals = await getAllProposals(connection, programId, realm.pubkey);

    console.log("proposals", proposals);

    break;
  }

}

run();
