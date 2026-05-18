FROM node:18-alpine

WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Expose Vite dev server port
EXPOSE 3000

# Run in development mode to allow hot module replacement
CMD ["npm", "run", "dev"]
