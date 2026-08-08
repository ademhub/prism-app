import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://fhlrjrbhbrhcvoowvlww.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZobHJqcmJoYnJoY3Zvb3d2bHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNTc3ODgsImV4cCI6MjEwMTYzMzc4OH0.bXcIx-WjD5BDfqU8SksnYgwrzfMKwuMXHOFOCvJiRMU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
