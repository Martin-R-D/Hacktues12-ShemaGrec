-- SafeRoute Video Clip Feature Migration
-- Run this script to add video_clip_path columns to existing databases
-- Created: 2026-04-08

-- Add video_clip_path column to near_crash_events table if it doesn't exist
ALTER TABLE IF EXISTS near_crash_events
ADD COLUMN IF NOT EXISTS video_clip_path TEXT;

-- Add video_clip_path column to hotspot_rankings table if it doesn't exist
ALTER TABLE IF EXISTS hotspot_rankings
ADD COLUMN IF NOT EXISTS video_clip_path TEXT;

-- Verify migration by checking column existence (PostgreSQL)
-- \d near_crash_events
-- \d hotspot_rankings

-- Expected output:
-- near_crash_events table should now have:
--   id, event_id, camera_id, event_time, cord_x, cord_y, risk_weight, source_type, image_base64, video_clip_path, created_at
--
-- hotspot_rankings table should now have:
--   id, rank, cord_x, cord_y, score, source_type, image_base64, video_clip_path, computed_at, (unique constraint on cord_x, cord_y, source_type)
