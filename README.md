# STEM研究部勤怠管理システム

This is a Next.js attendance management system for STEM research clubs, built with Supabase and Discord OAuth.

## Getting Started

### 1. Set up your Supabase Project

1.  Create a new project on [Supabase](https://supabase.com).
2.  Go to the **SQL Editor** in your Supabase project dashboard.
3.  Run the SQL queries from `supabase/migrations/` to create the necessary tables and functions.
4.  Go to **Authentication -> Providers** and enable the **Discord** provider. You will need a Discord Client ID and Client Secret from your Discord Developer Portal.
5.  In the Discord provider settings, make sure to add the following as a "Redirect URI": `http://localhost:9002/auth/callback`
6.  Go to **Project Settings -> API**. Find your Project URL and `anon` public key. You will need these for your environment variables.
7.  Go to **Project Settings -> Database**. Find your connection string (URI) and copy it for `DATABASE_URL`.

### 2. Environment Variables

Create a file named `.env.local` in the root of the project. Copy the contents of `.env.local.example` and fill in the values with your project's details.

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

