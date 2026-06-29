# Helpdesk & Ticketing System

A full-stack helpdesk and ticketing portal built with **Django 6 + Django REST Framework** (backend) and **Next.js 15** (frontend).

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Hardware Requirements](#hardware-requirements)
4. [Linux VPS Deployment](#linux-vps-deployment)
5. [Environment Variables](#environment-variables)
6. [Development Setup](#development-setup)

---

## Features

- Role-based access: End User, Agent, Manager, Admin
- Ticket lifecycle: New → Assigned → In Progress → Resolved → Closed + Reopen
- **Escalation**: Agents escalate tickets to the department manager with a reason; manager receives email + in-app notification
- **Routing modes per department**: Manager Assignment or Department Pool (any member claims and resolves)
- Customisable ticket categories mapped to departments — selecting a category auto-fills the department
- SLA policies per department and priority with breach alerts
- Auto-assignment (configured assignee → manager → least-busy agent)
- SMTP email notifications configurable from the Settings UI
- Per-event notification toggles (create / assign / status / comment / resolve / SLA / escalate)
- In-app notification bell with real-time unread count
- Active / Resolved & Closed tabs on the ticket list
- Audit log for all key actions
- Branding & portal customisation (logo, colours, portal name)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Django 6, Django REST Framework, SimpleJWT |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Frontend | Next.js 15 App Router, TypeScript, Tailwind CSS |
| State | Zustand (persisted auth) |
| HTTP client | Axios with JWT refresh-lock interceptor |
| Email | Django SMTP via `get_connection()` — configured from the UI |
| Task runner | Synchronous wrapper (drop-in Celery interface) |

---

## Hardware Requirements

Sizing assumes Ubuntu 22.04 LTS / 24.04 LTS, Gunicorn WSGI, Nginx reverse proxy, PostgreSQL, and Next.js served via Node.

| Concurrent Users | vCPU | RAM | Storage | Notes |
|---|---|---|---|---|
| **10** | 1 vCPU | 1 GB | 20 GB SSD | Smallest viable production node. 2–3 Gunicorn workers. SQLite is acceptable for evaluation; PostgreSQL required for real data. |
| **20** | 2 vCPU | 2 GB | 40 GB SSD | 4–6 Gunicorn workers. Add a 1 GB swap file as a safety net. |
| **30** | 2 vCPU | 4 GB | 60 GB SSD | 6–8 Gunicorn workers. PgBouncer connection pooling recommended. |
| **100** | 4 vCPU | 8 GB | 100 GB SSD | 10–16 Gunicorn workers or Uvicorn (ASGI). PgBouncer essential. Consider Redis for JWT/cache. |
| **1000** | 8+ vCPU | 16–32 GB | 200 GB SSD + object storage | Horizontal scaling: 2–3 app nodes behind a load balancer. Celery + Redis for async email/tasks. PostgreSQL read replica. CDN for static assets. |

> **Worker formula:** `workers = (2 × vCPU) + 1`. Each Gunicorn worker uses ~50–80 MB RSS.

---

## Linux VPS Deployment

### 1. Server preparation

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv python3-dev \
    build-essential libpq-dev nginx git curl
```

### 2. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Create a dedicated system user

```bash
sudo adduser --system --group helpdesk
sudo mkdir -p /opt/helpdesk
sudo chown helpdesk:helpdesk /opt/helpdesk
```

### 4. Clone the repository

```bash
sudo -u helpdesk git clone https://github.com/itgshoman1-prog/Helpdesk-Ticket.git /opt/helpdesk/app
cd /opt/helpdesk/app
```

### 5. Backend setup

```bash
cd /opt/helpdesk/app/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn psycopg2-binary
```

Copy and configure the environment file:

```bash
cp .env.example .env
nano .env   # set SECRET_KEY, DB_*, FRONTEND_URL
```

Run migrations and create the first admin:

```bash
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

### 6. Gunicorn systemd service

Create `/etc/systemd/system/helpdesk-backend.service`:

```ini
[Unit]
Description=Helpdesk Django Backend
After=network.target

[Service]
User=helpdesk
Group=helpdesk
WorkingDirectory=/opt/helpdesk/app/backend
EnvironmentFile=/opt/helpdesk/app/backend/.env
ExecStart=/opt/helpdesk/app/backend/venv/bin/gunicorn \
    config.wsgi:application \
    --bind 127.0.0.1:8000 \
    --workers 4 \
    --timeout 60 \
    --access-logfile /var/log/helpdesk/gunicorn-access.log \
    --error-logfile /var/log/helpdesk/gunicorn-error.log
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/log/helpdesk
sudo chown helpdesk:helpdesk /var/log/helpdesk
sudo systemctl daemon-reload
sudo systemctl enable --now helpdesk-backend
```

### 7. Frontend setup

```bash
cd /opt/helpdesk/app/frontend
npm ci
```

Create `/opt/helpdesk/app/frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
```

Build:

```bash
npm run build
```

Create `/etc/systemd/system/helpdesk-frontend.service`:

```ini
[Unit]
Description=Helpdesk Next.js Frontend
After=network.target

[Service]
User=helpdesk
Group=helpdesk
WorkingDirectory=/opt/helpdesk/app/frontend
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=NODE_ENV=production
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now helpdesk-frontend
```

### 8. Nginx reverse proxy

Create `/etc/nginx/sites-available/helpdesk`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 20M;

    # Django API
    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Django admin
    location /admin/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    location /static/ {
        alias /opt/helpdesk/app/backend/staticfiles/;
        expires 30d;
    }

    location /media/ {
        alias /opt/helpdesk/app/backend/media/;
        expires 7d;
    }

    # Next.js frontend
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/helpdesk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 9. SSL certificate (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 10. PostgreSQL setup

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql <<SQL
CREATE USER helpdeskuser WITH PASSWORD 'strongpassword';
CREATE DATABASE helpdeskdb OWNER helpdeskuser;
SQL
```

Set in `.env`:

```
DB_ENGINE=postgresql
DB_NAME=helpdeskdb
DB_USER=helpdeskuser
DB_PASSWORD=strongpassword
DB_HOST=localhost
DB_PORT=5432
```

### 11. Updates & redeployment

```bash
cd /opt/helpdesk/app && git pull origin main

# Backend
cd backend && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo systemctl restart helpdesk-backend

# Frontend
cd ../frontend && npm ci && npm run build
sudo systemctl restart helpdesk-frontend
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `SECRET_KEY` | Django secret key — **change in production** | — |
| `DEBUG` | `True` / `False` | `True` |
| `ALLOWED_HOSTS` | Comma-separated hostnames | `localhost,127.0.0.1` |
| `DB_ENGINE` | `sqlite` or `postgresql` | `sqlite` |
| `DB_NAME` | Database name | `ticketing_db` |
| `DB_USER` | Database user | — |
| `DB_PASSWORD` | Database password | — |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `FRONTEND_URL` | Public frontend URL used in email links | `http://localhost:3000` |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | Access token expiry (minutes) | `60` |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | Refresh token expiry (days) | `7` |

> SMTP credentials are configured from the **Settings → Email** page in the UI and stored in the database — no `.env` variable needed for email.

---

## Development Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # edit as needed
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

API available at `http://localhost:8000/api/`

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local
npm run dev
```

Frontend available at `http://localhost:3000`
