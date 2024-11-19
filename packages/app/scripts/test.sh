set -e # exit on errors
SINKRON_CONFIG=$(cat sinkron.config.test.json) docker compose \
    -f ./test.docker-compose.yml up \
    -d --build --renew-anon-volumes --force-recreate
pnpm build
SINKRON_CONFIG=$(cat config.test.json) pnpm migrate
SINKRON_CONFIG=$(cat config.test.json) mocha ./build/test.js
