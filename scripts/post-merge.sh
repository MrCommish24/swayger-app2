#!/usr/bin/env bash
set -euo pipefail

npm ci --no-audit --no-fund

# Database migrations are intentionally not run automatically. Supabase schema
# changes use project-specific migrations and require an explicit deployment step.
