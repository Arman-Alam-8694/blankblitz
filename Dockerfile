# Single-container deploy: the backend serves the built frontend on one port.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev -w backend -w shared --include-workspace-root && npm cache clean --force
COPY shared shared
COPY backend/src backend/src
COPY backend/tsconfig.json backend/
COPY --from=build /app/frontend/dist frontend/dist
USER node
EXPOSE 3001
ENV PORT=3001
CMD ["npm", "start"]
