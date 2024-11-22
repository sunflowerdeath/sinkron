set -e # exit on error
export SINKRON_CONFIG=$(cat ./config.test.json)
docker compose -f ./test.docker-compose.yml up \
    --detach --force-recreate --renew-anon-volumes
rspack --config rspack.config.test.js
mocha ./build/test.js
