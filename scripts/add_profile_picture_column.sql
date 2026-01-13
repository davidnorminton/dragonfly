-- Add profile_picture column to users table
-- Run this SQL command in your database

-- For PostgreSQL:
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture VARCHAR;

-- For SQLite:
-- ALTER TABLE users ADD COLUMN profile_picture VARCHAR;
