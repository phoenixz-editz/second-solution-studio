FROM node:20-bookworm-slim

WORKDIR /app
COPY . .

RUN corepack enable \
  && cd workspace \
  && pnpm install --frozen-lockfile \
  && PORT=3000 BASE_PATH=/ pnpm --filter @workspace/math-animation-engine run build \
  && pnpm --filter @workspace/api-server run build \
  && cd .. \
  && rm -rf dist backend/dist \
  && cp -a workspace/artifacts/math-animation-engine/dist dist \
  && cp -a workspace/artifacts/api-server/dist backend/dist

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]