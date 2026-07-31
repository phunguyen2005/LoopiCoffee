import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xjzyfgoqnsopobjcfmod.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqenlmZ29xbnNvcG9iamNmbW9kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMzMjI2NSwiZXhwIjoyMTAwOTA4MjY1fQ.AYOQp2vMyDVN07tZv4T91Dgafhsz89kkxSU9G1rAR0Y';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DEFAULT_PASSWORD = 'LoopiCafe2026!';

const SEED_ACCOUNTS = [
  {
    email: 'owner@loopicafe.com',
    displayName: 'Nguyễn Minh Linh (Owner)',
    role: 'owner',
  },
  {
    email: 'linh.nguyen@loopicafe.local',
    displayName: 'Nguyễn Minh Linh (Owner)',
    role: 'owner',
  },
  {
    email: 'manager@loopicafe.com',
    displayName: 'Trần Văn Minh (Manager)',
    role: 'manager',
  },
  {
    email: 'barista@loopicafe.com',
    displayName: 'Lê Phước An (Barista Trưởng)',
    role: 'employee',
  },
  {
    email: 'staff2@loopicafe.com',
    displayName: 'Phạm Quốc Bảo (Thu ngân)',
    role: 'employee',
  },
  {
    email: 'staff3@loopicafe.com',
    displayName: 'Nguyễn Thảo Vy (Barista)',
    role: 'employee',
  },
];

async function run() {
  console.log('Connecting to Supabase Cloud Admin API at:', SUPABASE_URL);

  const { data: existingData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (listError) {
    console.error('Error fetching Supabase users:', listError.message);
    process.exit(1);
  }

  const existingUsers = existingData.users || [];
  console.log(`Found ${existingUsers.length} existing users on Supabase Auth.`);

  for (const acc of SEED_ACCOUNTS) {
    const foundUser = existingUsers.find((u) => u.email?.toLowerCase() === acc.email.toLowerCase());

    if (!foundUser) {
      console.log(`Creating user: ${acc.email} (${acc.role})...`);
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: acc.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: acc.displayName,
          role: acc.role,
        },
      });

      if (createError) {
        console.error(`  Failed to create ${acc.email}:`, createError.message);
      } else {
        console.log(`  Successfully created user ID: ${created.user.id}`);
      }
    } else {
      console.log(`User ${acc.email} already exists (ID: ${foundUser.id}). Updating password & metadata...`);
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(foundUser.id, {
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: acc.displayName,
          role: acc.role,
        },
      });

      if (updateError) {
        console.error(`  Failed to update ${acc.email}:`, updateError.message);
      } else {
        console.log(`  Successfully updated ${acc.email}`);
      }
    }
  }

  console.log('\n✅ Supabase Cloud Auth Seed completed successfully!');
  console.log('Default Password for all seed accounts:', DEFAULT_PASSWORD);
}

run().catch(console.error);
