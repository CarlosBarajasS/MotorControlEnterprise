# Etapa de construcción (Angular Builder)
FROM node:20.10.0-alpine AS build
# Instalar dependencias globales necesarias
RUN npm install -g @angular/cli

WORKDIR /app
# Copiar configuración de dependencias
COPY package.json package-lock.json ./
RUN npm ci

# Copiar código fuente
COPY . .
# Construir para producción (el flag --configuration production es por defecto en Angular 17+)
RUN npm run build

# Etapa final de producción (Nginx)
FROM nginx:alpine
# Copiar la salida compilada de Angular a la carpeta publica de Nginx
# Ajusta "frontend" si tu dist genera otra carpeta interna
COPY --from=build /app/dist/frontend /usr/share/nginx/html

# Copiar configuración customizada de Nginx para manejar el ruteo de Angular (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
