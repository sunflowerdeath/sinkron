FROM node:23-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app
RUN rm -rf packages/app
RUN rm -rf packages/tauri
RUN --mount=type=cache,id=node23pnpm9,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN node --run front:build

FROM nginx:alpine
ENV STATIC_FILES_URL="/static"
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/packages/front/build /app
RUN chmod -R 777 /app
