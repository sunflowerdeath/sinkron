set -e # exit on error
rspack --config rspack.config.benchmark.js
node ./build/benchmark.js"
