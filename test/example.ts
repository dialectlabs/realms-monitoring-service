import { SquadsConnection } from '../src/squads/squads-connection';
import { SquadsService } from '../src/squads/squads.service';

async function run() {
  const squadsConnection = SquadsConnection.initialize();
  const squadsService = new SquadsService(squadsConnection);
  const data = await squadsService.getData();
  console.log(data[0]);
}

run();
