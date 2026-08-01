# Imagen base oficial de Playwright con Ubuntu Jammy y navegadores prediseñados
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias limpias
RUN npm ci

# Copiar el código fuente completo
COPY . .

# Generar cliente de Prisma
RUN npx prisma generate

# Compilar código TypeScript a JavaScript
RUN npm run build

# Exponer el puerto del API por defecto
EXPOSE 3000

# Comando por defecto para iniciar el servidor Webhook API
CMD ["npm", "run", "api:start"]
