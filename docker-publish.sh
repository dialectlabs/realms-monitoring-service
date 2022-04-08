package_version=$(jq -r .version package.json)

docker push dialectlab/squads-monitoring-service:"$package_version"
docker push dialectlab/squads-monitoring-service:latest