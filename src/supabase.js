import { createClient } from '@supabase/supabase-js' 

// URL déjà remplie ✅ (vérifie quand même dans Settings → API) 
const SUPABASE_URL = 'https://myipfprkixvgtlumyufq.supabase.co' 

// ⬇️ COLLE TA CLÉ "anon public" ICI, entre les guillemets ⬇️ 
const SUPABASE_KEY = 'sb_publishable_us52NuCiGfqJCrOAglgUxw_A5m83O-rI' 
  
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
