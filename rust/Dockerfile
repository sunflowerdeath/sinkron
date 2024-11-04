FROM rust:1.82-alpine3.20 AS build
COPY . /app
WORKDIR /app
RUN apk add --no-cache musl-dev
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build && cp /app/target/debug/sinkron /app/sinkron

FROM alpine:3.20
COPY --from=build /app/sinkron /app/sinkron
WORKDIR /app
EXPOSE 80
CMD ./sinkron
