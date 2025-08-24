const { loadEnvConfig } = require('@next/env')
const path = require('path')

// Load Next.js environment configuration
const projectDir = path.join(__dirname, '..')
loadEnvConfig(projectDir)

const { createClient } = require('@supabase/supabase-js')

async function fixDatabaseAmounts() {
  console.log('🔧 Fixing database amounts for native token compatibility...')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  try {
    // Get all users with wrong amounts
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true)

    if (fetchError) {
      console.error('❌ Error fetching users:', fetchError)
      return
    }

    console.log(`📊 Found ${users.length} users to check`)

    // Update user monthly fees to native token amounts
    const tierAmounts = {
      1: 0.05,  // Basic tier
      2: 0.1,   // Standard tier  
      3: 0.15   // Premium tier
    }

    for (const user of users) {
      if (user.tier && tierAmounts[user.tier]) {
        const correctAmount = tierAmounts[user.tier]
        
        if (user.monthly_fee !== correctAmount) {
          console.log(`🔄 Updating user ${user.wallet_address}:`)
          console.log(`   Tier ${user.tier}: ${user.monthly_fee} → ${correctAmount} BDG`)
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              monthly_fee: correctAmount,
              is_active: false // Deactivate so they need to re-sign
            })
            .eq('id', user.id)

          if (updateError) {
            console.error(`   ❌ Update failed:`, updateError)
          } else {
            console.log(`   ✅ Updated successfully`)
          }
        } else {
          console.log(`✅ User ${user.wallet_address} already has correct amount`)
        }
      }
    }

    // Deactivate all authorizations to force re-signing
    console.log('\n🔄 Deactivating old authorizations...')
    const { error: deactivateError } = await supabase
      .from('authorizations')
      .update({ is_active: false })
      .eq('is_active', true)

    if (deactivateError) {
      console.error('❌ Error deactivating authorizations:', deactivateError)
    } else {
      console.log('✅ All authorizations deactivated')
    }

    console.log('\n🎉 Database cleanup complete!')
    console.log('\n⚠️  Users will need to:')
    console.log('1. Go to /onboarding')
    console.log('2. Re-select their insurance tier') 
    console.log('3. Sign new authorization with correct native token amounts')

  } catch (error) {
    console.error('❌ Script failed:', error)
  }
}

// Run the fix
fixDatabaseAmounts()
  .then(() => console.log('\n✅ Fix complete'))
  .catch(err => {
    console.error('\n💥 Fix failed:', err)
    process.exit(1)
  })