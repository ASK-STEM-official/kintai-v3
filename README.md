# AttendanceZen

This is a Next.js attendance management system for STEM research clubs, built with Supabase and Discord OAuth.

## Getting Started

### 1. Set up your Supabase Project

1.  Create a new project on [Supabase](https://supabase.com).
2.  Go to the **SQL Editor** in your Supabase project dashboard.
3.  Copy the entire content of `supabase/migrations/0000_initial_schema.sql` and run it. This will create all the necessary tables, roles, policies, and functions.
4.  Go to **Authentication -> Providers** and enable the **Discord** provider. You will need a Discord Client ID and Client Secret from your Discord Developer Portal.
5.  In the Discord provider settings, make sure to add the following as a "Redirect URI": `http://localhost:9002/auth/callback`
6.  Go to **Project Settings -> API**. Find your Project URL and `anon` public key. You will need these for your environment variables.
7.  Go to **Project Settings -> Database**. Find your connection string (URI) and copy it for `DATABASE_URL`.

### 2. Environment Variables

Create a file named `.env.local` in the root of the project and add the following environment variables. Use `.env.local.example` as a template.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL=YOUR_SUPABASE_DATABASE_CONNECTION_STRING

# Discord OAuth
DISCORD_CLIENT_ID=YOUR_DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_DISCORD_CLIENT_SECRET

# Application
NEXT_PUBLIC_APP_URL=http://localhost:9002
```

### 3. Install Dependencies and Run the App

First, run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:9002](http://localhost:9002) with your browser to see the Kiosk screen.

## Key Features

*   **Kiosk Mode:** A real-time display for NFC card-based attendance tracking.
*   **QR Code Registration:** A seamless flow for new users to register via their smartphones.
*   **Discord Integration:** Secure authentication using Discord OAuth.
*   **Admin & User Dashboards:** Interfaces for managing users and viewing attendance data.

