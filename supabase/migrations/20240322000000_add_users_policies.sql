-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow inserting users for any instance
CREATE POLICY "Users can be inserted for any instance"
    ON users FOR INSERT
    WITH CHECK (true);

-- Allow viewing users for any instance
CREATE POLICY "Users are viewable by anyone"
    ON users FOR SELECT
    USING (true);

-- Allow updating users for any instance
CREATE POLICY "Users can be updated by anyone"
    ON users FOR UPDATE
    USING (true);

-- Allow deleting users for any instance
CREATE POLICY "Users can be deleted by anyone"
    ON users FOR DELETE
    USING (true); 