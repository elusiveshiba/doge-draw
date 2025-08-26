#!/bin/bash

# Development script for doge-draw
# This script sets up the environment and runs the custom server with WebSocket support

# Set required environment variables
export NEXTAUTH_SECRET="dev-secret-key-for-development-only-make-it-long-enough"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/dogedraw"
export REDIS_URL="redis://localhost:6379"
export HOSTNAME="0.0.0.0"
export PORT="6832"
export NODE_ENV="development"

# Ensure database is ready
echo "Waiting for database to be ready..."
until docker exec dogedraw-postgres pg_isready -U postgres; do
  echo "Database not ready, waiting..."
  sleep 1
done

echo "Database is ready!"

# Ensure Redis is ready
echo "Waiting for Redis to be ready..."
until docker exec dogedraw-redis redis-cli ping; do
  echo "Redis not ready, waiting..."
  sleep 1
done

echo "Redis is ready!"

# Run database migrations
echo "Running database migrations..."
npm run db:push

# Generate Prisma client
echo "Generating Prisma client..."
npm run db:generate

# Start the development server
echo "Starting development server with WebSocket support..."
npm run dev
