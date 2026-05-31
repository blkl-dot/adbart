import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://myipfprkixvgtlumyufq.supabase.co'

const SUPABASE_KEY = 'sb_publishable_us52NuCiGfqJCrOAglgUxw_A5m83O-r'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
