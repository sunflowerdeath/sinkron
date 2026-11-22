set -e # exit on error
# docker compose -f ../../crates/sinkron-tests/test.docker-compose.yml up \
    # --build --detach --force-recreate --renew-anon-volumes
rspack --config rspack.config.test.ts
mocha ./build/test.mjs
