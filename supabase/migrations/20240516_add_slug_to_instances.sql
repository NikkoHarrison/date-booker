-- Add slug column to instances table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'instances' 
        AND column_name = 'slug'
    ) THEN
        ALTER TABLE instances ADD COLUMN slug TEXT;
    END IF;
END $$;

-- Create index on slug for faster lookups if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'instances' 
        AND indexname = 'idx_instances_slug'
    ) THEN
        CREATE INDEX idx_instances_slug ON instances(slug);
    END IF;
END $$;

-- Update existing instances with slugs based on their names
UPDATE instances 
SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g'))
WHERE slug IS NULL;

-- Make slug column NOT NULL after populating existing records
ALTER TABLE instances ALTER COLUMN slug SET NOT NULL;

-- Add unique constraint if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'instances_slug_key'
    ) THEN
        ALTER TABLE instances ADD CONSTRAINT instances_slug_key UNIQUE (slug);
    END IF;
END $$; 