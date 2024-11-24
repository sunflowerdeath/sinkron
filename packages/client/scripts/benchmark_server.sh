set -e # exit on error
# TODO build
export SINKRON_CONFIG=$(cat config.benchmark.json)
../../sinkron/target/release/sinkron

 # sudo -E flamegraph -- ../../rust/target/benchmark/sinkron"
