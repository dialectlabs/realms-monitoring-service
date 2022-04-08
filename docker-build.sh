package_version=$(jq -r .version package.json)

docker build --platform linux/amd64 \
  -t dialectlab/squads-monitoring-service:"$package_version" \
  -t dialectlab/squads-monitoring-service:latest .