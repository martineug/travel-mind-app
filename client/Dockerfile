# --- builder ---
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:production

# --- runtime: nginx serving the built static files ---
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
# @angular/build's application builder outputs to dist/<project>/browser/ (no SSR configured).
COPY --from=builder /app/dist/client/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
