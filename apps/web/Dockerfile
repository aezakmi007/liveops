FROM node:22-alpine
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install --workspace=@liveops/shared --workspace=@liveops/web

COPY packages/shared packages/shared
COPY apps/web apps/web

WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]
