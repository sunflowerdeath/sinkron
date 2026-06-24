docker compose -f ./test.docker-compose.yml up \
    --build --force-recreate --renew-anon-volumes \
    --exit-code-from test
