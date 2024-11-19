set -e # exit on error
export SINKRON_CONFIG=$(cat config.benchmark.json)
../../rust/target/release/sinkron

 # sudo -E flamegraph -- ../../rust/target/benchmark/sinkron"
