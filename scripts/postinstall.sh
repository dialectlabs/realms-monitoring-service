set -x

current_dir=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
dapp_name=$(basename "$(dirname $current_dir)")

private_key_file="dev-keypair.private"
passphrase_file="dev-keypair.passphrase"
public_key_file="dev-keypair.public"

function install_deps() {
  npm install dotenv-cli -g
}

function generate_keys() {
  yes '' | solana-keygen new --outfile "$private_key_file" > "$passphrase_file"
  private_key=$(cat $private_key_file)
  public_key=$(solana-keygen pubkey "$private_key_file")
  echo "$public_key" > "$public_key_file"
  echo "DAPP_PUBLIC_KEY=${public_key}" > .env.client
  echo "DIALECT_SDK_CREDENTIALS=${private_key}" > .env.service
  solana airdrop 2 "$public_key" -u http://localhost:8899
  solana airdrop 2 "$public_key" -u https://api.devnet.solana.com/
}

function create_dapp() {
  dotenv -v DAPP_NAME="$dapp_name" -e "${current_dir}/../.env.dev" -e "${current_dir}/../.env.service" -- ts-node "${current_dir}/create-dapp.ts"
  dotenv -v DAPP_NAME="$dapp_name" -e "${current_dir}/../.env.local-dev" -e "${current_dir}/../.env.service" -- ts-node "${current_dir}/create-dapp.ts"
}

function update_namings() {
  sed -i '' "s/monitoring-service-template/$dapp_name/g" "${current_dir}/../package.json"
  sed -i '' "s/monitoring-service-template/$dapp_name/g" "${current_dir}/../deployment/deployment-devnet.yaml"
  sed -i '' "s/monitoring-service-template/$dapp_name/g" "${current_dir}/../deployment/deployment-mainnet.yaml"
}

if [ ! -f "$private_key_file" ]; then
  install_deps
  generate_keys
  create_dapp
  update_namings
fi

