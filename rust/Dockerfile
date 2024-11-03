FROM rust:1.82-alpine3.20 AS build
COPY . /app
WORKDIR /app
RUN apk add --no-cache musl-dev
RUN --mount=type=cache,target=/usr/local/cargo/registry cargo build

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/target/debug/sinkron /app
EXPOSE 80
CMD sinkron
