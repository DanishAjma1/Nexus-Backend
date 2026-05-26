# TrustBridgeAI Backend

A robust, AI-powered Node.js/Express backend for the **TrustBridge** platform — a full-featured web application that integrates real-time communication, AI assistance, payments, authentication, and push notifications into a single cohesive API.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [API Modules](#api-modules)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Overview

TrustBridgeAI Backend serves as the server-side engine for the TrustBridge web application (also referred to as "Nexus"). It exposes a RESTful API and a real-time WebSocket layer, handling everything from user authentication and AI-driven features to video calling, payments, and two-factor security.

---

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js (ESM modules) |
| Framework | Express 5 |
| Database | MongoDB via Mongoose |
| Real-time | Socket.IO + Redis Adapter |
| Cache / Pub-Sub | Redis |
| AI | OpenAI SDK |
| Payments | Stripe |
| Video Calling | Agora |
| Auth | JWT, Auth0 (express-openid-connect), bcrypt |
| Email | Nodemailer |
| File Uploads | Multer |
| 2FA | Speakeasy (TOTP), QRCode |
| Push Notifications | Web Push |
| Calendar Integration | Google APIs |
| Dev Tooling | Nodemon |

---

## Features

- **AI Integration** — OpenAI-powered endpoints for intelligent features within the platform.
- **Real-time Communication** — Socket.IO with a Redis adapter for scalable, multi-instance WebSocket support.
- **Video Calling** — Agora Access Token generation for in-app audio/video calls.
- **Authentication & Security** — JWT-based auth, Auth0 OIDC integration, bcrypt password hashing, and TOTP-based two-factor authentication (2FA) with QR code generation.
- **Payments** — Stripe integration for subscriptions or one-time payments.
- **Email** — Transactional email delivery via Nodemailer.
- **File Uploads** — Multer-handled file uploads stored in the `uploads/` directory.
- **Push Notifications** — Web Push API support for browser-based push notifications.
- **Google Calendar** — Integration with the Google APIs for calendar functionality.
- **Phone Validation** — libphonenumber-js for international phone number parsing and validation.
- **Caching** — Redis for session caching and pub/sub.

---

## Project Structure

```
TrustBridgeAI-Backend/
├── .github/
│   └── workflows/          # CI/CD GitHub Actions workflows
├── app/                    # Core application logic
│   ├── routes/             # Express route definitions
│   ├── controllers/        # Route handler logic
│   ├── models/             # Mongoose data models
│   ├── middleware/         # Auth guards, error handling, etc.
│   └── services/           # Business logic / third-party integrations
├── uploads/                # Uploaded files (served statically)
├── index.js                # App entry point
├── loadEnv.js              # Environment variable loader
├── seedIndustries.js       # Database seeder for industry data
├── debugOpenAI.js          # OpenAI debug/testing utility
├── testOpenAI.js           # OpenAI integration test script
├── package.json
└── .gitignore
```

---

## Prerequisites

- **Node.js** v18 or higher
- **MongoDB** instance (local or Atlas)
- **Redis** instance (local or managed)
- API keys for: OpenAI, Stripe, Agora, Auth0, Google APIs, and a web push key pair

---

## Getting Started

**1. Clone the repository**

```bash
git clone https://github.com/DanishAjma1/TrustBridgeAI-Backend.git
cd TrustBridgeAI-Backend
```

**2. Install dependencies**

```bash
npm install
```

**3. Set up environment variables**

Copy the example below into a `.env` file at the project root and fill in your values (see [Environment Variables](#environment-variables)).

**4. (Optional) Seed the database**

```bash
node seedIndustries.js
```

**5. Start the development server**

```bash
npm run dev
```

The server will start with hot-reload via Nodemon.

---

## Environment Variables

Create a `.env` file in the project root. The following variables are required:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/<dbname>

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# Auth0 (OIDC)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_BASE_URL=http://localhost:5000

# OpenAI
OPENAI_API_KEY=sk-...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Agora (Video Calling)
AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_certificate

# Nodemailer (Email)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_smtp_password

# Google APIs
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Web Push
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:your@email.com
```

> **Note:** Never commit your `.env` file. It is already listed in `.gitignore`.

---

## Available Scripts

| Script | Command | Description |
|---|---|---|
| Development | `npm run dev` | Starts server with Nodemon (hot reload) |
| Debug | `npm run debug` | Starts server with Node inspector attached |
| Production | `npm start` | Starts server with plain Node |
| Seed DB | `node seedIndustries.js` | Seeds industry categories into MongoDB |
| Test OpenAI | `node testOpenAI.js` | Runs OpenAI integration test |
| Debug OpenAI | `node debugOpenAI.js` | Runs OpenAI debug utility |

---

## API Modules

The backend is organized around the following functional modules:

| Module | Description |
|---|---|
| **Auth** | Registration, login, JWT issuance, Auth0 OIDC flow |
| **Users** | Profile management, avatar uploads |
| **2FA** | TOTP setup (QR code), verify, disable |
| **AI** | OpenAI-powered endpoints |
| **Video** | Agora token generation for calls |
| **Payments** | Stripe checkout sessions, webhooks |
| **Messaging** | Real-time chat via Socket.IO |
| **Notifications** | Web push subscriptions and dispatch |
| **Calendar** | Google Calendar read/write |
| **Industries** | Industry category data (seeded) |
| **Email** | Transactional email sending |

---

## Deployment

The repository includes a `.github/workflows/` directory for CI/CD automation. For manual deployment:

1. Set all environment variables on your server or hosting platform.
2. Run `npm install --production`.
3. Start the server with `npm start`.
4. Ensure MongoDB and Redis are reachable from your server.

For containerized deployments, a `Dockerfile` can be added mounting `index.js` as the entrypoint with `node index.js`.

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to your fork: `git push origin feature/your-feature-name`
5. Open a Pull Request.

Please follow conventional commit messages and keep PRs focused on a single concern.

---

> Built by [DanishAjma1](https://github.com/DanishAjma1)
