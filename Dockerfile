# Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Remove dev dependencies
RUN yarn install --frozen-lockfile --production

# Final image
FROM node:18-slim

WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create data directory for CSV files
RUN mkdir -p ./data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose the application port
EXPOSE 3001

# Create volume for persistent data
VOLUME ["/app/data"]

# Default command - start the API server
CMD ["node", "dist/index.js"]
