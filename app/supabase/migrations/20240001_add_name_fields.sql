-- ============================================================
-- Migration 001: Add first_name and last_name to profiles
-- Run this ONCE in Supabase SQL Editor
-- Safe to run — uses IF NOT EXISTS pattern, won't break anything
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name  TEXT DEFAULT '';
