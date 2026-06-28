# TrustShield

Scan anything before you trust it. Detect fraud, scan links, verify images, and understand legal documents in plain English.

## Project Structure

This project follows a monorepo structure with separate `frontend/` and `backend/` directories.

### Frontend (Next.js App Router)

```
frontend/
├── app/
│   ├── layout.tsx                  # Root layout — html, body, providers
│   ├── (public)/                   # Public marketing pages
│   │   ├── layout.tsx              # Navbar + Footer
│   │   ├── page.tsx                # Homepage
│   │   ├── pricing/page.tsx
│   │   └── auth/                   # Login, Signup, Reset
│   │
│   ├── (app)/                      # Authenticated application shell
│   │   ├── layout.tsx              # Navbar + AppSidebar
│   │   ├── dashboard/              # Dashboard, History, Settings
│   │   ├── scan/[type]/            # Dynamic scan routes
│   │   └── documents/              # Upload, History, [id]
│   │
│   ├── (admin)/                    # Admin shell
│   │   ├── layout.tsx              # AdminSidebar
│   │   ├── users/                  # User management
│   │   ├── scans/                  # Scan monitoring
│   │   └── settings/               # Admin settings
│   │
│   └── api/auth/[...nextauth]/     # NextAuth handlers
│
├── components/
│   ├── layout/                     # Navbar, Footer, Sidebars
│   ├── ui/                         # Button, Card, Badge, etc.
│   ├── scan/                       # Scan-specific components
│   ├── document/                   # Document-specific components
│   └── providers/                  # Auth, Theme providers
│
├── hooks/                          # TanStack Query hooks
├── types/                          # TypeScript types
└── lib/                            # Utils, API client, constants
```

### Backend (Express.js Layered Architecture)

```
backend/
├── src/
│   ├── routes/                     # URL definitions only
│   ├── controllers/                # Request/response shaping
│   ├── services/                   # Business logic (AI, PDF, etc.)
│   ├── models/                     # Mongoose schemas
│   ├── middleware/                  # Auth, validation, rate limiting
│   ├── validators/                 # Zod schemas
│   ├── config/                     # Database, Redis, Cloudinary
│   └── utils/                      # Helpers (ApiError, asyncHandler)
│
├── server.js                       # Entry point
└── .env                            # Environment variables
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Anthropic API key (for AI features)

### Installation

```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

### Environment Variables

Copy `.env.example` to `.env` in the backend directory and fill in your values:

```bash
cp .env.example .env
```

### Running the App

```bash
# Start backend (from backend/)
npm run dev

# Start frontend (from frontend/)
npm run dev
```

The frontend will be available at `http://localhost:3000` and the backend at `http://localhost:5000`.

## Architecture Rules

See `architecture.md` for the complete architectural guidelines.

Key principles:
1. **One root layout** — Shared UI lives once
2. **Route groups** — Different layouts without different URLs
3. **Layered backend** — Routes → Controllers → Services → Models
4. **Shared components** — Promote to `components/` when needed by 2+ pages
5. **Framework-agnostic services** — No `req`/`res` in service layer

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, TanStack Query
- **Backend:** Express.js, MongoDB/Mongoose, Anthropic Claude, Cloudinary, Redis
- **Auth:** NextAuth.js (frontend) + JWT (backend)
- **Validation:** Zod
- **Styling:** shadcn/ui components
