import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hpdjvuqpcegbmtddsdbp.supabase.co';

const supabasePublishableKey = 'YOUR_PUBLISHABLE_KEY';

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);
