import { Connection, PublicKey } from '@solana/web3.js';
import { getMultipleSquadAccounts } from '../src/api/parseSquad';

async function run() {
  const mainnetStagingPk = new PublicKey(
    'og295qHEFgcX6WyaMLKQPwDMdMxuHoXe7oQ7ywwyRMo',
  );
  const PROVIDER_URL =
    'https://solana-api.syndica.io/access-token/6sW38nSZ1Qm4WVRN4Vnbjb9EF2QudlpGZBToMtPyqoXqkIenDwJ5FVK1HdWSqqah/rpc';
  let connection = new Connection(PROVIDER_URL);

  console.log(
    `\nGetting all program accounts for programId: ${mainnetStagingPk}.`,
  );
  let programAccounts = await connection.getProgramAccounts(mainnetStagingPk);

  // votes
  // const voteAccountthreshold = 200;
  // let voteAccounts = programAccounts.filter(
  //   (it) => it.account.data.length < voteAccountthreshold,
  // );
  // console.log(`Total vote accounts: ${voteAccounts.length}`);

  // proposals
  // let proposals = programAccounts.filter(
  //   (it) => it.account.data.length < 8000 && it.account.data.length > 1000,
  // );
  // console.log(`Total proposal accounts: ${proposals.length}`);
  // let propDeser = await getMultipleProposalAccounts(connection, proposals.slice(0, 2).map((it: any) => it.pubkey));
  // console.log(propDeser.length)
  // console.log(propDeser[0])

  // squads
  let squadsAccounts = programAccounts.filter(
    (it) => it.account.data.length > 8000,
  );
  console.log(`Total squads accounts: ${squadsAccounts.length}`);

  let deserializedSquads = await getMultipleSquadAccounts(
    connection,
    squadsAccounts.map((it) => it.pubkey).slice(),
  );

  console.log(`\nDeserialized ${deserializedSquads.length} squads...\n`);
  deserializedSquads.map((squad) => {
    console.log(
      `\nChecking for members of squad ${squad.pubkey?.toBase58()}... Found ${
        squad.members?.length
      } members:\n`,
    );
    squad.members?.map((member) => console.log('  Member', member));
  });

  // old code
  // let fst = squads[0];
  // let members = fst.members;
  // console.log(members)
  // console.log(JSON.stringify(fst))
  // console.log(squads.length)
}

run();

enum ProposalType {
  Text = 0,
  Support = 1,
  Quorum = 2,
  WithdrawSol = 3,
  WithdrawSpl = 4,
  AddMember = 5,
  RemoveMember = 6,
  MintMemberToken = 7,
  Swap = 8,
}
