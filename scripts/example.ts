import { getRealms, getAllProposals } from '@solana/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';
import { TwitterApi } from 'twitter-api-v2';

async function run() {
  const PROVIDER_URL =
  'https://solana-api.syndica.io/access-token/6sW38nSZ1Qm4WVRN4Vnbjb9EF2QudlpGZBToMtPyqoXqkIenDwJ5FVK1HdWSqqah/rpc';
  const connection = new Connection(PROVIDER_URL);
  const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

  const realms = await getRealms(connection, programId);

  console.log(realms.length);

  // Fetch all the realms data
  // If a realm has a new proposal -> votingProposalCount if it increases
  // Get the new proposal(s) and tweet about it

  // let promises = realms.map(realm => {
  //   return getAllProposals(connection, programId, realm.pubkey);
  // });

  // await Promise.all(promises);
  for (const realm of realms) {
    if (realm.account.votingProposalCount > 0) {
      console.log("name: ", realm.account.name);
      console.log("accountType: ", realm.account.accountType);
      console.log("votingProposalCount: ", realm.account.votingProposalCount);
      console.log("realm all: ", realm);

      const proposals = await getAllProposals(connection, programId, realm.pubkey);

      console.log("proposals", proposals);

      // await getAllTokenOwnerRecords(connection, programId, realm.pubkey);

      break;
    }
  }

}

run();
