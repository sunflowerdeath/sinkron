FROM rust:1.97-alpine3.21 AS build
COPY . /app
WORKDIR /app
RUN apk add --no-cache musl-dev
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --locked --release && \
    cp /app/target/release/sinkron /app/sinkron

FROM alpine:3.21
COPY --from=build /app/sinkron /app/sinkron
WORKDIR /app
EXPOSE 80
CMD ./sinkron
