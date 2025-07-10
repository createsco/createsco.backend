-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(30) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified_at TIMESTAMP,
    phone JSONB NOT NULL,
    phone_verified_at TIMESTAMP,
    profile_pic VARCHAR(500),
    address TEXT NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('client', 'partner', 'admin')),
    plan_id UUID,
    last_login_at TIMESTAMP,
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": true}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    favourite_partners UUID[] DEFAULT '{}'
);

-- Create partners table
CREATE TABLE IF NOT EXISTS partners (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    specializations TEXT[],
    documents JSONB DEFAULT '[]',
    banner VARCHAR(500),
    portfolio TEXT[] DEFAULT '{}',
    experience_years INTEGER DEFAULT 0,
    services JSONB DEFAULT '[]',
    location_pricing JSONB DEFAULT '{}',
    payment_methods JSONB DEFAULT '{}',
    serving_locations TEXT[] DEFAULT '{}',
    partner_type VARCHAR(20) CHECK (partner_type IN ('studio', 'solo', 'firm', 'partnership')),
    avg_rating DECIMAL(3,2) DEFAULT 0.00,
    verified BOOLEAN DEFAULT FALSE,
    social_links JSONB DEFAULT '{}',
    project_stats JSONB DEFAULT '{"total": 0, "completed": 0, "ongoing": 0}',
    dashboard_data JSONB DEFAULT '{}',
    partner_locations JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- Create admins table
CREATE TABLE IF NOT EXISTS admins (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    social_links JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_partners_verified ON partners(verified);
CREATE INDEX IF NOT EXISTS idx_partners_avg_rating ON partners(avg_rating);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
