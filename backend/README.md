# EMR System — Phase 1 (Clean Start v3)

## What this is
A minimal Express backend + PostgreSQL connection with health checks and a DB check.
Use this to verify your environment before adding features.

## Quick start
1) In VS Code terminal:
```bash
cd backend
npm install
cp .env.example .env
```
2) Edit `backend/.env` and set your Postgres credentials (match the password you set).
3) Start Postgres (Postgres.app → Running).
4) Create the table once (in psql or pgAdmin) using `./sql/001_create_patients.sql`.
5) Run the server:
```bash
npm run dev
```
6) Test:
- `GET http://localhost:3000/health`
- `GET http://localhost:3000/api`
- `GET http://localhost:3000/api/db-check`

## Tips
- If you change `.env`, restart the server (Ctrl+C then `npm run dev`).
- If `/api/db-check` fails, verify credentials and try PGHOST=127.0.0.1.