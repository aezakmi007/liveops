FROM node:22-alpine
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/ws-server/package.json apps/ws-server/package.json

RUN npm install --workspace=@liveops/shared --workspace=@liveops/ws-server

COPY packages/shared packages/shared
COPY apps/ws-server apps/ws-server

WORKDIR /repo/apps/ws-server
EXPOSE 4000
CMD ["npm", "run", "dev"]
