-- Marketplace Server Database Schema
-- Migration 001: Initial schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(200),
  email VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plugins table
CREATE TABLE IF NOT EXISTS plugins (
  id SERIAL PRIMARY KEY,
  plugin_id VARCHAR(200) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  tags TEXT[],
  author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  license VARCHAR(50),
  homepage TEXT,
  repository TEXT,
  icon TEXT,
  downloads INTEGER DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  latest_version VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plugin versions table
CREATE TABLE IF NOT EXISTS plugin_versions (
  id SERIAL PRIMARY KEY,
  plugin_id INTEGER REFERENCES plugins(id) ON DELETE CASCADE,
  version VARCHAR(50) NOT NULL,
  changelog TEXT,
  file_url TEXT,
  checksum VARCHAR(64),
  dependencies JSONB,
  permissions JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plugin_id, version)
);

-- Downloads table
CREATE TABLE IF NOT EXISTS downloads (
  id SERIAL PRIMARY KEY,
  plugin_id INTEGER REFERENCES plugins(id) ON DELETE CASCADE,
  version VARCHAR(50),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plugins_plugin_id ON plugins(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugins_author_id ON plugins(author_id);
CREATE INDEX IF NOT EXISTS idx_plugins_category ON plugins(category);
CREATE INDEX IF NOT EXISTS idx_plugins_downloads ON plugins(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_plugins_rating ON plugins(rating DESC);
CREATE INDEX IF NOT EXISTS idx_plugins_created_at ON plugins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_plugin_id ON plugin_versions(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_version ON plugin_versions(version);
CREATE INDEX IF NOT EXISTS idx_downloads_plugin_id ON downloads(plugin_id);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_plugins_search ON plugins USING gin(
  to_tsvector('english', name || ' ' || display_name || ' ' || COALESCE(description, ''))
);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugins_updated_at
  BEFORE UPDATE ON plugins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
