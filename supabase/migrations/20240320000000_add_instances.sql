-- Create instances table
CREATE TABLE instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_by UUID,
    is_active BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Create instance_participants table
CREATE TABLE instance_participants (
    id BIGSERIAL PRIMARY KEY,
    instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'participant')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(instance_id, user_id)
);

-- Add instance_id to existing tables
ALTER TABLE users ADD COLUMN instance_id UUID REFERENCES instances(id) ON DELETE CASCADE;
ALTER TABLE availability ADD COLUMN instance_id UUID REFERENCES instances(id) ON DELETE CASCADE;
ALTER TABLE favorites ADD COLUMN instance_id UUID REFERENCES instances(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN instance_id UUID REFERENCES instances(id) ON DELETE CASCADE;
ALTER TABLE responses ADD COLUMN instance_id UUID REFERENCES instances(id) ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX idx_users_instance_id ON users(instance_id);
CREATE INDEX idx_availability_instance_id ON availability(instance_id);
CREATE INDEX idx_favorites_instance_id ON favorites(instance_id);
CREATE INDEX idx_messages_instance_id ON messages(instance_id);
CREATE INDEX idx_responses_instance_id ON responses(instance_id);
CREATE INDEX idx_instance_participants_instance_id ON instance_participants(instance_id);
CREATE INDEX idx_instance_participants_user_id ON instance_participants(user_id);

-- Add RLS (Row Level Security) policies
ALTER TABLE instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_participants ENABLE ROW LEVEL SECURITY;

-- Modify the policy for instances to avoid recursion
DROP POLICY IF EXISTS "Instances are viewable by participants" ON instances;

CREATE POLICY "Instances are viewable by participants"
    ON instances FOR SELECT
    USING (
        EXISTS (
            SELECT 1 
            FROM instance_participants 
            WHERE instance_participants.instance_id = instances.id 
            AND instance_participants.user_id = auth.uid()::uuid
        )
    );

CREATE POLICY "Instances can be created by authenticated users"
    ON instances FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Instances can be updated by owners"
    ON instances FOR UPDATE
    USING (
        id IN (
            SELECT instance_id 
            FROM instance_participants 
            WHERE user_id = auth.uid()::uuid
            AND role = 'owner'
        )
    );

-- Modify the policy for instance_participants to avoid recursion
DROP POLICY IF EXISTS "Instance participants are viewable by instance participants" ON instance_participants;

CREATE POLICY "Instance participants are viewable by instance participants"
    ON instance_participants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 
            FROM instances 
            WHERE instances.id = instance_participants.instance_id 
            AND instances.created_by = auth.uid()::uuid
        )
    );

-- Create policies for instance_participants
CREATE POLICY "Instance participants can be added by instance owners"
    ON instance_participants FOR INSERT
    WITH CHECK (
        instance_id IN (
            SELECT instance_id 
            FROM instance_participants 
            WHERE user_id = auth.uid()::uuid
            AND role = 'owner'
        )
    );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_instances_updated_at
    BEFORE UPDATE ON instances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instance_participants_updated_at
    BEFORE UPDATE ON instance_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 