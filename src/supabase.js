import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'myipfprkixvgtlumyufq'

const SUPABASE_KEY = 'myipfprkixvgtlumyufq'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
