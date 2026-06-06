# Supabase Migrations

All database schema changes must be tracked here as numbered SQL migration files.

## Naming Convention
`YYYYMMDD_description.sql` — e.g. `20240001_add_name_fields.sql`

## How to Apply
1. Write your SQL in a new migration file
2. Run it in the Supabase dashboard SQL editor (or via Supabase CLI)
3. Commit the file to git

## Rules
- **Never make manual schema changes** in the Supabase dashboard without adding a migration file
- **Never edit existing migration files** — add a new one instead
- All migrations should be idempotent where possible (`CREATE TABLE IF NOT EXISTS`, etc.)

## Current Migrations
| File | Description |
|---|---|
| 20240001_add_name_fields.sql | Add first_name/last_name to profiles |
| 20240002_profile_trigger.sql | Auto-create profile on user signup |
| 20240003_subscription_fields.sql | Add subscription tier/status fields |
| 20260521_add_seeded_at.sql | Add seeded_at to profiles (replaces jk_seeded localStorage flag) |
