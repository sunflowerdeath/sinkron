FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /app
WORKDIR /app
RUN rm -rf packages/sinkron-client
RUN rm -rf packages/paper-front
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run -r build

FROM base
COPY . /app
WORKDIR /app
RUN rm -rf packages/sinkron-client
RUN rm -rf packages/paper-front
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
COPY --from=build /app/packages/paper-back/build /app/packages/paper-back/build 
COPY --from=build /app/packages/sinkron/build /app/packages/sinkron/build 
WORKDIR /app/packages/paper-back
EXPOSE 80
CMD ["pnpm", "start"]
