set -e # exit on error
export SINKRON_CONFIG=$(cat config.benchmark.json)
cd ../../sinkron

# RUSTFLAGS="--cfg tokio_unstable"
cargo build --release
./target/release/sinkron

# cargo build
# ./target/debug/sinkron

# sudo -E flamegraph -- ./target/debug/sinkron
