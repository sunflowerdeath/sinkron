FROM node:23-alpine
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app
RUN rm -rf packages/front
RUN rm -rf packages/tauri
RUN --mount=type=cache,id=node23pnpm9,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN node --run app:build
EXPOSE 80
CMD node --run app:start
