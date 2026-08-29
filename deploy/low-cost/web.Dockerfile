FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/prompts/package.json packages/prompts/package.json
RUN npm ci
RUN npm install --no-save @rollup/rollup-linux-arm64-musl
COPY apps/web apps/web
COPY packages/contracts packages/contracts
ARG VITE_API_ORIGIN=""
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN npm run build --workspace=@receptionist/contracts && npm run build --workspace=@receptionist/web

FROM nginx:1.27-alpine
COPY deploy/low-cost/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
