# ---- build stage ----
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- run stage ----
FROM node:18-alpine
WORKDIR /app
RUN npm i -g serve
COPY --from=build /app/build ./build
ENV PORT=3000
EXPOSE 3000
# Bind to 0.0.0.0 and $PORT for Render
CMD ["sh", "-c", "serve -s build -l tcp://0.0.0.0:${PORT}"]
