set -e # exit on error
docker compose -f ./test.docker-compose.yml up \
    --build --detach --force-recreate --renew-anon-volumes
