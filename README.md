# Doge Draw

Collaborative pixel art platform powered by Dogecoin.

## Features
- Real-time collaborative pixel art boards
- Buy credits with Dogecoin (1 DOGE = 100 credits)
- Dynamic pixel pricing (price increases with each change)
- Community moderation (report/hide pixels)
- Admin tools for board management
- Wallet-based authentication
- Persistent pixel history and board archiving

## Tech Stack
- Next.js 15, React 19, TypeScript, Tailwind CSS
- Konva.js (canvas)
- Node.js WebSocket server (Socket.io)
- PostgreSQL (Prisma ORM)
- JWT authentication

## Setup
1. **Install Docker Compose**
   - If you don't have Docker Compose, follow the official guide: https://docs.docker.com/compose/install/
   - On most systems with Docker Desktop, Docker Compose is included by default.
2. **Clone & Install**
   ```bash
   git clone <repo>
   cd doge-draw
   npm install --legacy-peer-deps
   ```
3. **Database**
   - Use Docker: `docker-compose up -d`
   - Or local: `createdb dogedraw`
4. **Environment**
   - Copy `.env.example` to `.env` and update values
5. **Run Migrations**
   ```bash
   npx prisma migrate dev
   ```
6. **Initialize DB**
   ```bash
   npm run init-db
   ```
7. **Start Dev**
   ```bash
   npm run dev
   ```

## Usage
- Visit `http://localhost:3000`
- Register/login with Dogecoin wallet address
- Paint pixels, buy credits, and join boards

## Admin
- Add wallet addresses to `ADMIN_WALLET_ADDRESSES` in `.env` for admin access

## Commands
- `npm run dev` – Start frontend & WebSocket server
- `npm run init-db` – Initialize database
- `npm run build` – Production build

## Project Structure
- `src/app/` – Pages & API routes
- `src/components/` – React components
- `server/` – WebSocket server
- `prisma/` – Database schema
