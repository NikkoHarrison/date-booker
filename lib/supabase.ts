import { createClient } from "@supabase/supabase-js"

// Type definitions for our database tables
export type User = {
  id: number
  name: string
  selected: boolean
  created_at: string
}

export type AvailabilityRecord = {
  id: number
  user_name: string
  date_key: string
  is_available: boolean
  created_at: string
  updated_at: string
}

export type FavoriteRecord = {
  id: number
  user_name: string
  date_key: string
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export type MessageRecord = {
  id: number
  sender: string
  text: string
  timestamp: string
}

export type ResponseRecord = {
  id: number
  user_name: string
  has_responded: boolean
  cant_attend: boolean
  updated_at: string
}

// Create a single supabase client for the browser
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
