package_version=$(jq -r .version package.json)

docker push dialectlab/realms-monitoring-service:"$package_version"
docker push dialectlab/realms-monitoring-service:latest
