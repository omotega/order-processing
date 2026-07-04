# DEVELOPMENT BUILD (with hot reload):
FROM node:20-alpine AS development

WORKDIR /usr/src/app

# Copy package files
COPY package.json yarn.lock* ./

# Install all dependencies including dev
RUN yarn install --frozen-lockfile

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Start in development mode
CMD ["yarn", "start:dev"