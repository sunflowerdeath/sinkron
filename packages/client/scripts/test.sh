set -e # exit on error
export SINKRON_CONFIG=$(cat ./config.test.json)
docker compose -f ./test.docker-compose.yml up \
    -d --build --renew-anon-volumes --force-recreate
rspack --config rspack.config.test.js
mocha ./build/test.js
