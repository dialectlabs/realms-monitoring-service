# squads-monitoring-service

### generate a new keypair for squads monitoring service and fund it

```bash
export keypairs_dir=~/projects/dialect
solana-keygen new --outfile ${keypairs_dir}/squads-service-dev-local-key.json
solana-keygen pubkey ${keypairs_dir}/squads-service-dev-local-key.json > ${keypairs_dir}/squads-service-dev-local-key.pub
solana -k ${keypairs_dir}/squads-service-dev-local-key.json airdrop 300
```
### start server

```
export keypairs_dir=~/projects/dialect
PRIVATE_KEY=$(cat ${keypairs_dir}/squads-service-dev-local-key.json) yarn start:dev
```

### start client

```shell
export keypairs_dir=~/projects/dialect
MONITORING_SERVICE_PUBLIC_KEY=$(cat ${keypairs_dir}/squads-service-dev-local-key.pub) ts-node test/squads-clients.ts
```