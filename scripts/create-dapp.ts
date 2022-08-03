import { createDappIfAbsent } from '@dialectlabs/monitor';
import {
  Backend,
  Environment,
  NodeDialectWalletAdapter,
} from '@dialectlabs/sdk';

async function main() {
  const environment = process.env.DIALECT_SDK_ENVIRONMENT as Environment;
  const dappName = process.env.DAPP_NAME as string;
  if (!(process.env.DIALECT_SDK_CREDENTIALS && environment && dappName)) {
    console.log(process.env.DIALECT_SDK_CREDENTIALS);
    console.log(environment);
    console.log(dappName);
    return;
  }
  const wallet = NodeDialectWalletAdapter.create();
  console.log(
    `Creating dapp ${dappName} with public key ${wallet.publicKey.toBase58()} on env ${environment}`,
  );
  await createDappIfAbsent(dappName, {
    wallet,
    environment,
    backends: [Backend.DialectCloud],
  });
}

main();
