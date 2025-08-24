const { loadEnvConfig } = require('@next/env')
const path = require('path')

// Load Next.js environment configuration
const projectDir = path.join(__dirname, '..')
loadEnvConfig(projectDir)

const { ethers } = require('ethers')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

// Load the ABI
const CONTRACT_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '../contracts/MicroInsurance-ABI.json'), 'utf8'))

async function comprehensiveInsuranceTest() {
  console.log('🚀 Comprehensive Insurance System Test...')
  console.log('   - Payment processing')
  console.log('   - Claim eligibility')
  console.log('   - Claim submission')
  console.log('   - Claim approval')
  console.log('   - Payout processing')
  
  // Environment check (extends test-with-contract.js pattern)
  const required = [
    'BLOCKDAG_RPC_URL',
    'PRIVATE_KEY', 
    'NEXT_PUBLIC_CONTRACT_ADDRESS',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ]
  
  for (const env of required) {
    if (!process.env[env]) {
      console.error(`❌ Missing: ${env}`)
      process.exit(1)
    }
    console.log(`${env}: ✅`)
  }

  // Initialize connections (same as test-with-contract.js)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
  
  console.log(`📡 Admin Wallet: ${wallet.address}`)
  
  // Check balance
  const balance = await provider.getBalance(wallet.address)
  console.log(`💰 Admin Balance: ${ethers.formatEther(balance)} BDG`)

  // Connect to contract
  const contract = new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    CONTRACT_ABI,
    wallet
  )

  console.log(`📋 Contract: ${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`)

  try {
    // 1. PAYMENT PROCESSING (extends test-with-contract.js)
    console.log('\n🔥 === PAYMENT PROCESSING ===')
    await processPayments(contract, supabase, wallet, balance)

    // 2. CLAIM ELIGIBILITY CHECK
    console.log('\n🔍 === CLAIM ELIGIBILITY CHECK ===')
    await checkClaimEligibility(contract, supabase)

    // 3. CLAIM SUBMISSION (simulate user submission)
    console.log('\n📝 === CLAIM SUBMISSION ===')
    await processClaimSubmissions(contract, supabase)

    // 4. ADMIN CLAIM APPROVAL
    console.log('\n✅ === CLAIM APPROVAL ===')
    await processClaimApprovals(contract, supabase)

    // 5. PAYOUT PROCESSING
    console.log('\n💰 === PAYOUT PROCESSING ===')
    await processPayouts(contract, supabase)

    // 6. SYSTEM HEALTH CHECK
    console.log('\n📊 === SYSTEM HEALTH CHECK ===')
    await systemHealthCheck(contract, supabase)

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  }
}

// 1. PAYMENT PROCESSING (based on test-with-contract.js)
async function processPayments(contract, supabase, wallet, balance) {
  // Get users ready for payment (same query as test-with-contract.js)
  const { data: users, error } = await supabase
    .from('users')
    .select(`
      id,
      wallet_address,
      tier,
      monthly_fee,
      last_paid_at,
      is_active,
      authorizations!inner(
        typed_data_json,
        signature,
        is_active
      )
    `)
    .eq('is_active', true)
    .eq('authorizations.is_active', true)
    .limit(5)

  if (error) {
    console.error('❌ Database error:', error)
    return
  }

  console.log(`👥 Found ${users.length} users`)

  if (users.length === 0) {
    console.log('⚠️  No users found for payment processing')
    return
  }

  // Check relayer status
  const isRelayer = await contract.isRelayer(wallet.address)
  if (!isRelayer) {
    console.log(`⚠️  Wallet ${wallet.address} is not a relayer`)
    return
  }

  // Process payments (batch processing from test-with-contract.js)
  const readyUsers = []
  
  for (const user of users) {
    const lastPaid = await contract.lastPaidAt(user.wallet_address)
    const now = Math.floor(Date.now() / 1000)
    const paymentPeriod = 30 * 24 * 60 * 60 // 30 days
    
    if (lastPaid > 0 && now < Number(lastPaid) + paymentPeriod) {
      console.log(`   ⏳ User ${user.wallet_address} payment not due yet`)
      continue
    }
    
    readyUsers.push(user)
  }

  if (readyUsers.length === 0) {
    console.log('⏳ No users ready for payment')
    return
  }

  // Execute batch payment (same logic as test-with-contract.js)
  const auths = []
  const signatures = []
  let totalAmount = BigInt(0)

  for (const user of readyUsers) {
    const auth = user.authorizations[0]
    const typedData = auth.typed_data_json
    
    // Validate signature
    try {
      const recovered = ethers.verifyTypedData(
        typedData.domain,
        typedData.types,
        typedData.value,
        auth.signature
      )
      
      if (recovered.toLowerCase() !== user.wallet_address.toLowerCase()) {
        console.log(`   ❌ Invalid signature for ${user.wallet_address}`)
        continue
      }
      
      auths.push(typedData.value)
      signatures.push(auth.signature)
      totalAmount += BigInt(typedData.value.amount)
      
      console.log(`   ✅ Added ${user.wallet_address} to batch`)
    } catch (err) {
      console.log(`   ❌ Signature error for ${user.wallet_address}:`, err.message)
    }
  }

  if (auths.length > 0) {
    console.log(`💳 Executing batch payment for ${auths.length} users...`)
    console.log(`   Total: ${ethers.formatEther(totalAmount)} BDG`)
    
    try {
      const tx = await contract.payBatch(auths, signatures, { 
        value: totalAmount 
      })
      
      console.log(`   TX: ${tx.hash}`)
      const receipt = await tx.wait()
      console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`)
      
      // Update database
      const timestamp = new Date().toISOString()
      for (const user of readyUsers.slice(0, auths.length)) {
        await supabase
          .from('users')
          .update({ 
            last_paid_at: timestamp,
            total_paid: (user.total_paid || 0) + user.monthly_fee
          })
          .eq('id', user.id)
      }
      
      console.log(`🎉 Payment processing complete!`)
      
    } catch (error) {
      console.error(`❌ Payment failed:`, error.message)
    }
  }
}

// 2. CLAIM ELIGIBILITY CHECK
async function checkClaimEligibility(contract, supabase) {
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)

  if (!users || users.length === 0) {
    console.log('⚠️  No users to check eligibility')
    return
  }

  for (const user of users) {
    console.log(`\n👤 Checking eligibility: ${user.wallet_address}`)
    
    try {
      // Get user policy from contract
      const policy = await contract.getUserPolicy(user.wallet_address)
      
      if (!policy.active) {
        console.log(`   ❌ No active policy`)
        continue
      }

      // Get tier info to calculate months paid
      const tier = await contract.getTier(user.tier)
      const monthsPaid = policy.totalPaid > 0n ? Number(policy.totalPaid / tier.monthlyFee) : 0
      const totalPaidBDG = ethers.formatEther(policy.totalPaid)
      
      console.log(`   📊 Policy Status:`)
      console.log(`      Tier: ${policy.tier}`)
      console.log(`      Total Paid: ${totalPaidBDG} BDG`)
      console.log(`      Months Paid: ${monthsPaid}`)
      console.log(`      Last Payment: ${policy.lastPaidAt > 0n ? new Date(Number(policy.lastPaidAt) * 1000).toISOString() : 'Never'}`)
      
      // Check eligibility (6 months required)
      const requiredMonths = 6
      const eligible = monthsPaid >= requiredMonths
      
      console.log(`   ${eligible ? '✅' : '❌'} Claim Eligible: ${eligible ? 'YES' : `NO (need ${requiredMonths} months, have ${monthsPaid})`}`)
      
    } catch (error) {
      console.log(`   ❌ Error checking eligibility:`, error.message)
    }
  }
}

// 3. CLAIM SUBMISSION (simulate user submissions)
async function processClaimSubmissions(contract, supabase) {
  // Get eligible users who haven't submitted claims yet
  const { data: eligibleUsers } = await supabase
    .from('users')
    .select(`
      *,
      claims(*)
    `)
    .eq('is_active', true)

  if (!eligibleUsers || eligibleUsers.length === 0) {
    console.log('⚠️  No users found for claim submission')
    return
  }

  for (const user of eligibleUsers) {
    // Check if user already has an active claim
    const activeClaim = user.claims?.find(c => c.status === 'pending' || c.status === 'approved')
    if (activeClaim) {
      console.log(`   ⚠️  User ${user.wallet_address} already has active claim`)
      continue
    }

    // Check contract eligibility
    try {
      const policy = await contract.getUserPolicy(user.wallet_address)
      const tier = await contract.getTier(user.tier)
      const monthsPaid = policy.totalPaid > 0n ? Number(policy.totalPaid / tier.monthlyFee) : 0
      
      if (monthsPaid >= 6) {
        console.log(`📝 Submitting claim for eligible user: ${user.wallet_address}`)
        
        // Submit to database (simulating user action)
        const documentHash = `birth_cert_${user.wallet_address.slice(-8)}_${Date.now()}`
        
        const { error } = await supabase
          .from('claims')
          .insert({
            user_id: user.id,
            document_hash: documentHash,
            status: 'pending',
            installments_total: 4,
            installments_paid: 0,
            created_at: new Date().toISOString()
          })

        if (error) {
          console.log(`   ❌ Database error:`, error.message)
        } else {
          console.log(`   ✅ Claim submitted (hash: ${documentHash})`)
        }
      }
    } catch (error) {
      console.log(`   ❌ Error submitting claim:`, error.message)
    }
  }
}

// 4. ADMIN CLAIM APPROVAL
async function processClaimApprovals(contract, supabase) {
  // Get pending claims
  const { data: pendingClaims } = await supabase
    .from('claims')
    .select(`
      *,
      users(*)
    `)
    .eq('status', 'pending')

  if (!pendingClaims || pendingClaims.length === 0) {
    console.log('⚠️  No pending claims to approve')
    return
  }

  for (const claim of pendingClaims) {
    console.log(`\n✅ Approving claim for: ${claim.users.wallet_address}`)
    
    try {
      // Get tier to determine payout amount
      const tier = await contract.getTier(claim.users.tier)
      const payoutAmount = tier.payoutAmount
      
      console.log(`   💰 Payout Amount: ${payoutAmount} Rands`)
      
      // Convert to wei for contract (assuming 1 Rand = 0.001 BDG for this test)
      const payoutAmountWei = ethers.parseEther((Number(payoutAmount) * 0.001).toString())
      
      // Call contract to approve claim
      const tx = await contract.approveClaim(claim.users.wallet_address, payoutAmountWei)
      console.log(`   TX: ${tx.hash}`)
      
      const receipt = await tx.wait()
      console.log(`   ✅ Contract approval confirmed in block ${receipt.blockNumber}`)
      
      // Update database
      await supabase
        .from('claims')
        .update({
          status: 'approved',
          payout_amount: Number(payoutAmount),
          claim_start_date: new Date().toISOString()
        })
        .eq('id', claim.id)
      
      console.log(`   📝 Database updated`)
      
    } catch (error) {
      console.log(`   ❌ Approval failed:`, error.message)
    }
  }
}

// 5. PAYOUT PROCESSING
async function processPayouts(contract, supabase) {
  // Get approved claims ready for payout
  const { data: approvedClaims } = await supabase
    .from('claims')
    .select(`
      *,
      users(*)
    `)
    .eq('status', 'approved')
    .lt('installments_paid', 4)

  if (!approvedClaims || approvedClaims.length === 0) {
    console.log('⚠️  No approved claims ready for payout')
    return
  }

  for (const claim of approvedClaims) {
    console.log(`\n💰 Processing payout for: ${claim.users.wallet_address}`)
    console.log(`   Installment: ${claim.installments_paid + 1}/4`)
    
    try {
      // Call contract to process payout
      const tx = await contract.processPayout(claim.users.wallet_address)
      console.log(`   TX: ${tx.hash}`)
      
      const receipt = await tx.wait()
      console.log(`   ✅ Payout confirmed in block ${receipt.blockNumber}`)
      
      // Update database
      const newInstallmentsPaid = claim.installments_paid + 1
      const newStatus = newInstallmentsPaid >= 4 ? 'completed' : 'approved'
      
      await supabase
        .from('claims')
        .update({
          installments_paid: newInstallmentsPaid,
          status: newStatus
        })
        .eq('id', claim.id)
      
      console.log(`   📝 Database updated (${newInstallmentsPaid}/4 installments)`)
      
      if (newStatus === 'completed') {
        console.log(`   🎉 Claim completed!`)
      }
      
    } catch (error) {
      console.log(`   ❌ Payout failed:`, error.message)
    }
  }
}

// 6. SYSTEM HEALTH CHECK
async function systemHealthCheck(contract, supabase) {
  console.log(`\n📊 System Health Report`)
  
  try {
    // Contract stats
    const contractBalance = await contract.getContractBalance()
    const totalPremiums = await contract.totalPremiumsCollected()
    
    console.log(`💰 Contract Balance: ${ethers.formatEther(contractBalance)} BDG`)
    console.log(`📈 Total Premiums Collected: ${ethers.formatEther(totalPremiums)} BDG`)
    
    // Database stats
    const { data: users } = await supabase.from('users').select('*', { count: 'exact' })
    const { data: claims } = await supabase.from('claims').select('*', { count: 'exact' })
    const { data: pendingClaims } = await supabase.from('claims').select('*', { count: 'exact' }).eq('status', 'pending')
    const { data: approvedClaims } = await supabase.from('claims').select('*', { count: 'exact' }).eq('status', 'approved')
    const { data: completedClaims } = await supabase.from('claims').select('*', { count: 'exact' }).eq('status', 'completed')
    
    console.log(`👥 Total Users: ${users?.length || 0}`)
    console.log(`📋 Total Claims: ${claims?.length || 0}`)
    console.log(`⏳ Pending Claims: ${pendingClaims?.length || 0}`)
    console.log(`✅ Approved Claims: ${approvedClaims?.length || 0}`)
    console.log(`🎉 Completed Claims: ${completedClaims?.length || 0}`)
    
    // Tier distribution
    for (let i = 1; i <= 3; i++) {
      const tier = await contract.getTier(i)
      console.log(`📊 Tier ${i}: ${ethers.formatEther(tier.monthlyFee)} BDG/month → ${tier.payoutAmount} Rands`)
    }
    
  } catch (error) {
    console.log(`❌ Health check error:`, error.message)
  }
}

// Run comprehensive test
comprehensiveInsuranceTest()
  .then(() => console.log('\n🎉 Comprehensive test completed successfully!'))
  .catch(err => {
    console.error('\n💥 Test failed:', err)
    process.exit(1)
  })
