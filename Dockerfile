FROM node:22-bookworm-slim AS base

WORKDIR /usr/src/app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

FROM base AS development

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

EXPOSE 3200

CMD ["yarn", "start:dev"]

FROM development AS build

RUN yarn build

FROM base AS production-dependencies

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

FROM base AS production

ENV NODE_ENV=production

COPY --from=production-dependencies /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json ./
COPY scripts/register-path-aliases.js ./scripts/register-path-aliases.js

EXPOSE 3200

CMD ["node", "-r", "./scripts/register-path-aliases.js", "dist/main"]
