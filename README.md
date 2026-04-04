# Nexora

Nexora is a modern, full-stack task management and productivity application (Kanban-style) designed for optimal user experience and robust functionality. It utilizes a React frontend with Vite for fast builds and an Express/Node.js backend with MongoDB.

## Features

- **Authentication System & Security**
  - Secure Email/Password registration and login using JWT.
  - Google Authentication support.
  - Role-based Access Control (e.g., Admin-only User management).
  
- **Task Management**
  - Interactive Kanban Boards with drag-and-drop support (`@dnd-kit`).
  - Dashboard overview of tasks and progress.

- **Integrations**
  - Google Calendar Synchronization: Sync your task deadlines directly to Google Calendar.
  - Email Notifications: Automated email alerts utilizing Nodemailer.

- **User Profile & Settings**
  - Personalize user profiles.
  - Granular application and notification settings.

- **Modern & Responsive UI**
  - Built with React, TailwindCSS, and Shadcn UI components for a premium look and feel.
  - Smooth micro-animations and responsive layout adaptable to all screen sizes.

## Tech Stack

### Frontend
- **Framework:** React 18, Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Shadcn UI (Radix UI), `tailwindcss-animate`
- **State Management / Data Fetching:** `@tanstack/react-query`, React Context (`AuthProvider`)
- **Routing:** React Router DOM (v6)
- **Forms & Validation:** React Hook Form, Zod

### Backend
- **Framework:** Node.js, Express 5
- **Database:** MongoDB, Mongoose
- **Authentication:** `jsonwebtoken`, `bcryptjs`, `google-auth-library`
- **Email Services:** Nodemailer

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- MongoDB (Local or Atlas)
- Google Cloud Console API credentials (for Calendar/Auth integration)

### Installation

1. **Clone the repository** (if applicable) or navigate to the project directory:
   ```bash
   cd Nexora
   ```

2. **Backend Setup**
   ```bash
   cd BackEnd
   npm install
   # Create a .env file and add your MongoDB URI, JWT Secret, and Google API Keys.
   ```

3. **Frontend Setup**
   ```bash
   cd ../FrontEnd
   npm install
   # Create a .env file and add your VITE_API_URL and other necessary public keys.
   ```

### Running the Application

**Development Mode**

You can run both the frontend and backend concurrently from the Root/Frontend workspace (using `concurrently`):

```bash
cd FrontEnd
npm run start
```

Alternatively, you can run them separately:
- **Backend:** `cd BackEnd && npm start` (or `npm run dev` if nodemon is configured)
- **Frontend:** `cd FrontEnd && npm run dev`

### Building for Production

**Frontend:**
```bash
cd FrontEnd
npm run build
```

## Folder Structure

```
Nexora/
├── BackEnd/               # Node.js + Express backend
│   ├── package.json
│   ├── server.js          # Entry point
│   ├── db.js              # Database connection
│   └── ...
└── FrontEnd/              # React + Vite frontend
    ├── package.json
    ├── src/
    │   ├── components/    # Reusable UI components
    │   ├── context/       # React Context (Auth, etc.)
    │   ├── hooks/         # Custom React hooks
    │   ├── pages/         # Application pages (Dashboard, Board, Profile)
    │   └── ...
    └── ...
```
