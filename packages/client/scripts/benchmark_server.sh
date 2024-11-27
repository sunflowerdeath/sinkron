set -e # exit on error
export SINKRON_CONFIG=$(cat config.benchmark.json)
cd ../../sinkron
cargo build --release
./target/release/sinkron
 # sudo -E flamegraph -- ./target/benchmark/sinkron"
