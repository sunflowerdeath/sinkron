set -e # exit on errors
docker compose -f ./test.docker-compose.yml up \
    --detach --build --force-recreate --renew-anon-volumes
pnpm build
SINKRON_CONFIG=$(cat config.test.json) pnpm migrate
SINKRON_CONFIG=$(cat config.test.json) mocha ./build/test.js
