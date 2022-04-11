import {
  getAllProposals,
  getAllTokenOwnerRecords,
  getRealms,
} from '@solana/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';

async function run() {
  const connection = new Connection(process.env.RPC_URL!);
  const programId = new PublicKey(
    'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
  );

  const realms = await getRealms(connection, programId);

  console.log(realms.length);

  // const programAccounts = await connection.getProgramAccounts(
  //   programId,
  // );

  // console.log(programAccounts);
  // console.log(programAccounts[0].account.owner.toBase58());

  // Fetch all the realms data
  // If a realm has a new proposal -> votingProposalCount if it increases
  // Get the new proposal(s) and tweet about it

  // let promises = realms.map(realm => {
  //   return getAllProposals(connection, programId, realm.pubkey);
  // });

  // const realmsPromises = realms.map(async realm => {
  //   return {
  //     realm: realm,
  //     proposals: (await getAllProposals(connection, programId, realm.pubkey)).flat(),
  //     tokenOwnerRecords: await getAllTokenOwnerRecords(connection, programId, realm.pubkey),
  //   };
  // });

  // await Promise.all(realmsPromises);
  for (const realm of realms) {
    if (realm.account.votingProposalCount > 0) {
      console.log('name: ', realm.account.name);
      console.log('accountType: ', realm.account.accountType);
      console.log('votingProposalCount: ', realm.account.votingProposalCount);
      console.log('realm all: ', realm);

      const proposals = await getAllProposals(
        connection,
        programId,
        realm.pubkey,
      );

      console.log('proposals', proposals);

      const tokenOwnerRecords = await getAllTokenOwnerRecords(
        connection,
        programId,
        realm.pubkey,
      );

      console.log('token owner records length: ', tokenOwnerRecords.length);
      console.log('token owner records: ', tokenOwnerRecords);

      for (const tokenHolder of tokenOwnerRecords) {
        console.log(
          'token holder address: ',
          tokenHolder.account.governingTokenOwner.toBase58(),
        );
      }

      break;
    }
  }
}

run();
