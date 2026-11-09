# Docker

## Summary

The project is fully dockerized:

- **backend**: Express API (with in-memory CSA transit routing over `/gtfs_data`)
- **frontend**: Nuxt UI
- **smarthub_data**: persistent volume for SQLite (`/data/smarthub.sqlite`)

## Production

```bash
cp .env.example .env
docker compose up -d
```

### Ports
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:3001`

### Frontend API URL
Set `NUXT_PUBLIC_API_BASE_URL` in `.env` to the **server address** clients will use
(e.g., `http://192.168.0.10:3000`).

### SQLite storage
SQLite is stored in `/data/smarthub.sqlite` (volume `smarthub_data`). Override with `DB_PATH` if needed.

## Development

Use the dev override for live reload:

```bash
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up
```

This runs:
- `tsx watch` for the backend
- `nuxt dev` for the frontend
