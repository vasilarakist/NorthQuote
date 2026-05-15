-- Add scope_summary column to quotes for AI-generated scope of work text,
-- separate from notes_to_client which is the contractor's manual message.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS scope_summary TEXT;
