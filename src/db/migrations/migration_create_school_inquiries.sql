-- Migration: Create School Inquiries Table
-- Description:
--   1. Creates school_inquiries table for school lead capture
--   2. Adds performance indexes on created_at, status, and city
--   3. Enables Row Level Security (RLS) with public insert and service role full access

-- Enable UUID extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create school_inquiries table
CREATE TABLE IF NOT EXISTS school_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_name VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  contact_person VARCHAR(255) NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  designation VARCHAR(100),
  query TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for efficient lookup & administrative filtering
CREATE INDEX IF NOT EXISTS idx_school_inquiries_created_at ON school_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_inquiries_status ON school_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_school_inquiries_city ON school_inquiries(city);

-- 3. Enable Row Level Security
ALTER TABLE school_inquiries ENABLE ROW LEVEL SECURITY;

-- 4. Policies
-- Allow anyone (public / authenticated) to insert a new school connect inquiry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'school_inquiries' AND policyname = 'Allow public insert to school_inquiries'
  ) THEN
    CREATE POLICY "Allow public insert to school_inquiries" 
      ON school_inquiries FOR INSERT 
      TO anon, authenticated 
      WITH CHECK (true);
  END IF;
END $$;

-- Allow service role full access for administrative operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'school_inquiries' AND policyname = 'Allow service role full access to school_inquiries'
  ) THEN
    CREATE POLICY "Allow service role full access to school_inquiries" 
      ON school_inquiries FOR ALL 
      TO service_role 
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;
