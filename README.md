Portfolio Website Timeline
==========================

This repo linearizes the historic drops into one git history. Branch/tag alignment:

- v1 – earliest snapshot: v1 backend commit 7212ed0, v1 frontend commit 87eb4ee.
- v1.5 – mid snapshot: backend 5c8ce73 (server optimizations), frontend 098b360 (SEO + sitemap/robots updates).
- v2 – deployment-ready snapshot: backend 44305f5 (Docker/Heroku + multi-origin CORS), frontend 9a9089f (performance/SEO tweaks).
- v3 – latest/current (also master): backend 80aefa5 (SEO/robots + optimizations), frontend cd0e3f4 (LazyImage + loading optimizations).
- v4 – currently same as v3 (placeholder).

Structure per snapshot
----------------------
- backend/ – Express API + admin/auth, Mongo models, deploy configs.
- frontend/ – Vite + Tailwind SPA with admin dashboard and portfolio pages.

Notes
-----
- Source legacy folders portfoliowebsite v1/v2/v3 remain untracked for reference.
- node_modules, builds, and .env files are ignored at root via .gitignore.

Usage
-----
- Switch versions: `git checkout v1` (or v1.5, v2, v3, v4, master).
- Inspect tags: `git tag --list 'v*'`.