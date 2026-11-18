import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hpdjvuqpcegbmtddsdbp.supabase.co';

const supabasePublishableKey = 'sb_publishable_-x9Ow43lmeGLgkFaNjW9Gw_r6VEG1cu';

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);
