# Doge Draw - Collaborative Pixel Art Board

A decentralized pixel art platform where users spend Dogecoin-purchased credits to paint pixels on shared canvases. Each pixel's price increases dynamically, creating a unique art economy powered by the Dogecoin community.

## Features

- **Collaborative Pixel Art**: Paint pixels on shared canvases in real-time
- **Dogecoin Integration**: Purchase credits with DOGE (1 DOGE = 100 credits)
- **Dynamic Pricing**: Pixel prices increase by a multiplier each time they're changed
- **Real-time Updates**: WebSocket integration for live collaboration
- **Content Moderation**: Community reporting system (5 reports hide a pixel)
- **Admin Controls**: Board creation, management, and moderation tools
- **Secure Authentication**: Wallet address-based user accounts
- **Persistent History**: Full pixel change history and time-lapse export
- **Board Archiving**: Frozen boards remain viewable as permanent art
- **Time-Limited Boards**: Optional end dates for temporary art competitions
- **Multi-Admin Support**: Multiple Dogecoin addresses can have admin privileges

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Canvas**: Konva.js for pixel art rendering
- **Backend**: Next.js API Routes + Node.js WebSocket server
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Socket.io for WebSocket communication
- **Authentication**: JWT tokens with bcrypt password hashing
- **Blockchain**: Dogecoin integration for payments

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL database or Docker
- Dogecoin wallet (for credit purchases)

## 🏗️ Setup Instructions

### 1. Clone and Install

```bash
git clone <repository-url>
cd doge-draw
npm install --legacy-peer-deps
```

### 2. Database Setup

**Option A: Using Docker (Recommended)**
```bash
# Start PostgreSQL container
docker-compose up -d

# This creates a PostgreSQL database at:
# Host: localhost:5432
# Database: dogedraw
# User: postgres
# Password: postgres
```

**Option B: Local PostgreSQL**
```bash
# Install PostgreSQL and create database
createdb dogedraw
```

### 3. Environment Configuration

Create a `.env` file based on `.env.example`:

```env
# Database Configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/dogedraw?schema=public"

# Admin Configuration
# Comma-separated list of Dogecoin wallet addresses that should have admin privileges
ADMIN_WALLET_ADDRESSES="D7Y55JjjP71xEpZ7vQJ1J4aKVbMt6Q1Hk7,DQA91Z8J9Z8J9Z8J9Z8J9Z8J9Z8J9Z8J9Z"

# Authentication Secret
NEXTAUTH_SECRET="your-secret-key-here"

# WebSocket Configuration
WEBSOCKET_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:6832"
```

**Admin Configuration:**
- The `ADMIN_WALLET_ADDRESSES` environment variable accepts multiple Dogecoin wallet addresses separated by commas
- All addresses in this list will be granted admin privileges during registration
- Admins can create boards, manage settings, and access admin controls

### 4. Database Initialization

```bash
# Initialize database with Prisma schema and sample data
npm run init-db
```

This command:
- Pushes the Prisma schema to your database
- Generates the Prisma client
- Creates an admin user and sample boards

### 5. Development

```bash
# Start development servers (frontend + WebSocket)
npm run dev
```

This automatically:
- Ensures database schema is up to date
- Starts Next.js frontend on `http://localhost:3000`
- Starts WebSocket server on `http://localhost:3001`

## 🎮 Getting Started

### Default Admin Account
- **Wallet Address**: `D7Y55JjjP71xEpZ7vQJ1J4aKVbMt6Q1Hk7`
- **Password**: `admin123`

### For Regular Users
1. Visit `http://localhost:3000`
2. Click "Join Now" to register
3. Use any valid Dogecoin wallet address
4. Start painting on available boards!

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login  
- `GET /api/auth/me` - Get current user

### Boards
- `GET /api/boards` - List all boards
- `GET /api/boards/[id]` - Get specific board
- `POST /api/boards` - Create new board (admin only)
- `PATCH /api/boards/[id]` - Update board (admin only)

### Pixels
- `POST /api/pixels/paint` - Paint a pixel
- `POST /api/pixels/report` - Report inappropriate pixel

## 🔧 WebSocket Events

### Client → Server
- `join-board` - Join a board room for real-time updates
- `pixel-painted` - Broadcast pixel change to other users

### Server → Client
- `board-state` - Initial board state when joining
- `pixel-update` - Real-time pixel changes
- `credits-update` - User credit balance updates
- `pixel-hidden` - Pixel hidden due to reports

## 🛠️ Development Commands

```bash
# Development
npm run dev              # Start both frontend and WebSocket server
npm run dev:next         # Start only Next.js frontend
npm run dev:ws           # Start only WebSocket server

# Database
npm run init-db          # Initialize database with sample data
npm run db:studio        # Open Prisma Studio (database GUI)
npm run db:push          # Push schema changes to database
npm run db:generate      # Generate Prisma client

# Production
npm run build            # Build for production
npm start                # Start production frontend
npm run start:ws         # Start production WebSocket server
```

## 🚀 Production Deployment

### Frontend (Vercel)
```bash
# Build with database migrations
npm run build

# Deploy to Vercel
vercel deploy
```

### Backend (VPS/Docker)
```bash
# Using Docker Compose
docker-compose up -d

# Or traditional deployment
npm run build
npm start &              # Frontend
npm run start:ws &       # WebSocket server
```

## 🎯 Project Structure

```
doge-draw/
├── src/
│   ├── app/                 # Next.js App Router pages and API
│   ├── components/          # React components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities and database client
│   ├── providers/          # Context providers
│   └── types/              # TypeScript definitions
├── server/                 # WebSocket server
├── scripts/               # Database scripts
├── prisma/               # Database schema
└── docker-compose.yml    # PostgreSQL setup
```

## 🧪 Testing the Application

1. **Admin Features**:
   - Login as admin to create/manage boards
   - Test board freezing and activation

2. **User Features**:
   - Register new users with different wallet addresses  
   - Test pixel painting and price escalation
   - Try the reporting system

3. **Real-time Features**:
   - Open multiple browser tabs
   - Paint pixels and watch real-time updates

## 🔧 Troubleshooting

### Database Issues
```bash
# Reset database completely
docker-compose down -v    # If using Docker
npm run db:push --force-reset
npm run init-db
```

### Port Conflicts
```bash
# Check what's using ports
lsof -ti:3000 | xargs kill -9   # Frontend
lsof -ti:3001 | xargs kill -9   # WebSocket
lsof -ti:5432 | xargs kill -9   # PostgreSQL
```

### Import Errors
The project uses `@/` path aliases. If you see import errors:
```bash
# Regenerate Prisma client
npm run db:generate

# Clear Next.js cache
rm -rf .next
npm run dev
```

## 🎨 Customization

### Creating New Boards
As an admin, you can create boards with:
- Custom canvas sizes (10x10 to 1000x1000)
- Different starting pixel prices
- Various price multipliers (1.1x to 5.0x)

### Styling
The project uses Tailwind CSS. Customize colors and styling in:
- `tailwind.config.js` 
- `src/app/globals.css`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with `npm run dev`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🐕 Much Pixel. Very Art. Wow.

Built with love for the Dogecoin community. To the moon! 🚀🌙
