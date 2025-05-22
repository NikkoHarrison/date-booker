import { createClient } from "@supabase/supabase-js"

// Type definitions for our database tables
export type User = {
  id: string
  name: string
  selected: boolean
  created_at: string
  instance_id: string // Add instance_id to link users to specific instances
}

export type AvailabilityRecord = {
  id: number
  user_id: string
  date: string
  is_available: boolean
  created_at: string
  updated_at: string
  instance_id: string // Add instance_id to link availability to specific instances
}

export type FavoriteRecord = {
  id: number
  user_id: string
  date: string
  is_favorite: boolean
  created_at: string
  updated_at: string
  instance_id: string // Add instance_id to link favorites to specific instances
}

export type MessageRecord = {
  id: number
  user_id: string
  content: string
  created_at: string
  instance_id: string // Add instance_id to link messages to specific instances
}

export type ResponseRecord = {
  id: number
  user_id: string
  has_responded: boolean
  cant_attend: boolean
  updated_at: string
  instance_id: string // Add instance_id to link responses to specific instances
}

// New types for instance-based system
export type Instance = {
  id: string // UUID
  name: string
  password: string // Hashed password
  start_date: string
  end_date: string
  created_at: string
  updated_at: string
  created_by: string // User ID of creator
  is_active: boolean
}

export type InstanceParticipant = {
  id: number
  instance_id: string
  user_id: string
  role: 'owner' | 'participant'
  created_at: string
  updated_at: string
}

// Create a single supabase client for the browser
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

console.log('Initializing Supabase client with URL:', supabaseUrl)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
