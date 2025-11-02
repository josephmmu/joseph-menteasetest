# ---- build stage ----
FROM node:18-alpine AS build
WORKDIR /app
ARG REACT_APP_API_URL
ARG REACT_APP_GOOGLE_CLIENT_ID
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_GOOGLE_CLIENT_ID=$REACT_APP_GOOGLE_CLIENT_ID
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
