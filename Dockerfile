# build front-end
FROM node:24-alpine AS frontend

ARG GIT_COMMIT_HASH=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ARG RELEASE_VERSION=v0.0.0

ENV VITE_GIT_COMMIT_HASH=$GIT_COMMIT_HASH
ENV VITE_RELEASE_VERSION=$RELEASE_VERSION

WORKDIR /app

COPY ./package.json /app

COPY ./pnpm-lock.yaml /app

RUN corepack enable

RUN pnpm install

COPY . /app

RUN pnpm run build

# build backend
FROM node:24-alpine AS backend

WORKDIR /app

COPY /service/package.json /app

COPY /service/pnpm-lock.yaml /app

RUN corepack enable

RUN pnpm install

COPY /service /app

RUN pnpm build

# service
FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY /service/package.json /app

COPY /service/pnpm-lock.yaml /app

RUN corepack enable

RUN pnpm install --production && rm -rf /root/.npm /root/.pnpm-store /usr/local/share/.cache /tmp/*

COPY /service /app

COPY --from=frontend /app/dist /app/public

COPY --from=backend /app/build /app/build

EXPOSE 3002

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "--import", "tsx/esm", "./build/index.js"]
