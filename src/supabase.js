import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://myipfprkixvgtlumyufq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_TA_CLE_ICI'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
