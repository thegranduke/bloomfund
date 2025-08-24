'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { supabase } from '../../lib/supabase'

export default function AdminDashboard() {
  const [claims, setClaims] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'claims' | 'system'>('overview')
  const [contractStats, setContractStats] = useState<any>(null)
  const [testResults, setTestResults] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // Get all pending claims
    const { data: claimsData } = await supabase
      .from('claims')
      .select(`
        *,
        users(*)
      `)
      .order('created_at', { ascending: false })

    setClaims(claimsData || [])

    // Get all users with their authorization data
    const { data: usersData } = await supabase
      .from('users')
      .select(`
        *,
        authorizations(*)
      `)
      .order('created_at', { ascending: false })

    setUsers(usersData || [])
    
    // Load contract stats
    await loadContractStats()
  }

  async function loadContractStats() {
    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL)
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
        [
          'function getContractBalance() external view returns (uint256)',
          'function totalPremiumsCollected() external view returns (uint256)',
          'function getTier(uint256 tierId) external view returns (uint256 monthlyFee, uint256 payoutAmount, bool active)',
          'function getUserPolicy(address user) external view returns (uint256 tier, uint256 lastPaidAt, uint256 totalPaid, bool active)'
        ],
        provider
      )

      const balance = await contract.getContractBalance()
      const totalPremiums = await contract.totalPremiumsCollected()
      
      // Get tier info
      const tiers = []
      for (let i = 1; i <= 3; i++) {
        const tier = await contract.getTier(i)
        tiers.push({
          id: i,
          monthlyFee: ethers.formatEther(tier.monthlyFee),
          payoutAmount: tier.payoutAmount.toString(),
          active: tier.active
        })
      }

      setContractStats({
        balance: ethers.formatEther(balance),
        totalPremiums: ethers.formatEther(totalPremiums),
        tiers
      })
    } catch (error) {
      console.error('Error loading contract stats:', error)
    }
  }

  async function approveClaim(claim: any, payoutAmount: number) {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/approve-claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claimId: claim.id,
          payoutAmount: payoutAmount
        })
      })

      const result = await response.json()
      
      if (result.success) {
        alert('✅ Claim approved successfully!')
        loadData()
      } else {
        alert('Claim approval failed: ' + result.error)
      }
      
    } catch (error: any) {
      alert('Claim approval failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function rejectClaim(claimId: string) {
    setIsLoading(true)
    try {
      const { error } = await supabase
        .from('claims')
        .update({ status: 'rejected' })
        .eq('id', claimId)

      if (error) throw error
      
      alert('Claim rejected')
      loadData()
      
    } catch (error: any) {
      alert('Rejection failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function processPayout(claim: any) {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/process-payout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claimId: claim.id
        })
      })

      const result = await response.json()
      
      if (result.success) {
        alert('✅ Payout processed!')
        loadData()
      } else {
        alert('Payout failed: ' + result.error)
      }
      
    } catch (error: any) {
      alert('Payout failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  // New admin functions
  async function updateUserTier(userId: string, newTier: number) {
    setIsLoading(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          tier: newTier,
          is_active: false // Require re-signing
        })
        .eq('id', userId)

      if (error) throw error
      
      // Deactivate old authorizations
      await supabase
        .from('authorizations')
        .update({ is_active: false })
        .eq('user_id', userId)

      alert('✅ User tier updated! User will need to re-sign.')
      loadData()
    } catch (error: any) {
      alert('Update failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function manualPayment(userAddress: string, amount: string) {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/manual-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress: userAddress,
          amount: amount
        })
      })

      const result = await response.json()
      
      if (result.success) {
        alert(`✅ ${result.message}\nTX: ${result.transactionHash}`)
      } else {
        alert('Payment failed: ' + result.error)
      }
      
    } catch (error: any) {
      alert('Payment failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function runComprehensiveTest() {
    setIsLoading(true)
    setTestResults('🔄 Running comprehensive contract test...\n')
    
    try {
      const response = await fetch('/api/run-contract-test', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: 'comprehensive-insurance-test.js' })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      setTestResults(result.output || 'No output received')
    } catch (error: any) {
      setTestResults(`❌ Test failed: ${error.message}\n\nPlease check:\n- Is the dev server running?\n- Are the script files in the scripts/ directory?\n- Check the browser console for more details`)
      console.error('Test error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function runBasicContractTest() {
    setIsLoading(true)
    setTestResults('🔄 Running basic contract test...\n')
    
    try {
      const response = await fetch('/api/run-contract-test', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: 'test-with-contract.js' })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      setTestResults(result.output || 'No output received')
    } catch (error: any) {
      setTestResults(`❌ Test failed: ${error.message}\n\nPlease check:\n- Is the dev server running?\n- Are the script files in the scripts/ directory?\n- Check the browser console for more details`)
      console.error('Test error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function calculateUserPaymentMonths(user: any) {
    if (!contractStats) return 0
    
    try {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL)
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
        ['function getUserPolicy(address user) external view returns (uint256 tier, uint256 lastPaidAt, uint256 totalPaid, bool active)'],
        provider
      )

      const policy = await contract.getUserPolicy(user.wallet_address)
      const tierFee = ethers.parseEther(contractStats.tiers.find((t: any) => t.id === user.tier)?.monthlyFee || '0.05')
      
      return policy.totalPaid > BigInt(0) ? Number(policy.totalPaid / tierFee) : 0
    } catch (error) {
      return 0
    }
  }

  // User Management Card Component
  function UserManagementCard({ user, onUpdateTier, onManualPayment, contractStats, isLoading }: any) {
    const [userPaymentMonths, setUserPaymentMonths] = useState<number>(0)

    useEffect(() => {
      if (user.wallet_address && contractStats) {
        calculateUserPaymentMonths(user).then(setUserPaymentMonths)
      }
    }, [user, contractStats])

    return (
      <div className="border rounded-lg p-6 bg-white">
        <div className="grid md:grid-cols-3 gap-6">
          {/* User Info */}
          <div>
            <h4 className="font-bold text-lg mb-2">User Information</h4>
            <p><strong>Email:</strong> {user.auth_user_id || 'N/A'}</p>
            <p><strong>Wallet:</strong> {user.wallet_address}</p>
            <p><strong>Tier:</strong> {user.tier}</p>
            <p><strong>Monthly Fee:</strong> {user.monthly_fee} BDG</p>
            <p><strong>Status:</strong> 
              <span className={`ml-2 px-2 py-1 rounded text-sm ${
                user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {user.is_active ? 'Active' : 'Inactive'}
              </span>
            </p>
            <p><strong>Registered:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
          </div>

          {/* Payment Info */}
          <div>
            <h4 className="font-bold text-lg mb-2">Payment Status</h4>
            <p><strong>Months Paid:</strong> {userPaymentMonths}/6 (for claims)</p>
            <p><strong>Total Paid (DB):</strong> {user.total_paid || 0} BDG</p>
            <p><strong>Last Payment:</strong> {user.last_paid_at ? new Date(user.last_paid_at).toLocaleDateString() : 'Never'}</p>
            <p><strong>Authorizations:</strong> {user.authorizations?.filter((a: any) => a.is_active).length || 0} active</p>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${Math.min((userPaymentMonths / 6) * 100, 100)}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-600 mt-1">Claims eligibility progress</p>
            </div>
          </div>

          {/* Admin Actions */}
          <div>
            <h4 className="font-bold text-lg mb-2">Admin Actions</h4>
            <div className="space-y-2">
              {/* Tier Management */}
              <div>
                <label className="block text-sm font-medium mb-1">Change Tier:</label>
                <div className="flex space-x-1">
                  {[1, 2, 3].map(tier => (
                    <button
                      key={tier}
                      onClick={() => onUpdateTier(user.id, tier)}
                      disabled={isLoading || user.tier === tier}
                      className={`px-3 py-1 rounded text-sm ${
                        user.tier === tier 
                          ? 'bg-blue-100 text-blue-800 border-2 border-blue-300' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      T{tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual Payment */}
              <div>
                <button
                  onClick={() => {
                    const amount = prompt('Enter BDG amount to send to user:')
                    if (amount) onManualPayment(user.wallet_address, amount)
                  }}
                  disabled={isLoading}
                  className="w-full bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 disabled:opacity-50"
                >
                  💰 Send BDG
                </button>
              </div>

              {/* Reset User */}
              <div>
                <button
                  onClick={async () => {
                    if (confirm('Reset user? This will deactivate all authorizations.')) {
                      await supabase
                        .from('users')
                        .update({ is_active: false, total_paid: 0 })
                        .eq('id', user.id)
                      
                      await supabase
                        .from('authorizations')
                        .update({ is_active: false })
                        .eq('user_id', user.id)
                      
                      alert('✅ User reset!')
                      loadData()
                    }
                  }}
                  disabled={isLoading}
                  className="w-full bg-red-500 text-white px-3 py-2 rounded text-sm hover:bg-red-600 disabled:opacity-50"
                >
                  🔄 Reset User
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      {/* Tab Navigation */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', name: 'Overview', icon: '📊' },
              { id: 'users', name: 'User Management', icon: '👥' },
              { id: 'claims', name: 'Claims', icon: '📋' },
              { id: 'system', name: 'System Tools', icon: '🔧' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* System Stats */}
          <div className="grid md:grid-cols-5 gap-4">
            <div className="bg-blue-50 p-6 rounded-lg">
              <h3 className="font-bold text-blue-800">Total Users</h3>
              <p className="text-2xl font-bold text-blue-600">{users.length}</p>
            </div>
            <div className="bg-yellow-50 p-6 rounded-lg">
              <h3 className="font-bold text-yellow-800">Pending Claims</h3>
              <p className="text-2xl font-bold text-yellow-600">
                {claims.filter(c => c.status === 'pending').length}
              </p>
            </div>
            <div className="bg-green-50 p-6 rounded-lg">
              <h3 className="font-bold text-green-800">Active Payouts</h3>
              <p className="text-2xl font-bold text-green-600">
                {claims.filter(c => c.status === 'approved').length}
              </p>
            </div>
            <div className="bg-purple-50 p-6 rounded-lg">
              <h3 className="font-bold text-purple-800">Contract Balance</h3>
              <p className="text-2xl font-bold text-purple-600">
                {contractStats ? `${contractStats.balance} BDG` : 'Loading...'}
              </p>
            </div>
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="font-bold text-gray-800">Total Premiums</h3>
              <p className="text-2xl font-bold text-gray-600">
                {contractStats ? `${contractStats.totalPremiums} BDG` : 'Loading...'}
              </p>
            </div>
          </div>

          {/* Contract Tiers */}
          {contractStats && (
            <div className="bg-white p-6 rounded-lg border">
              <h3 className="text-xl font-bold mb-4">Insurance Tiers</h3>
              <div className="grid md:grid-cols-3 gap-4">
                {contractStats.tiers.map((tier: any) => (
                  <div key={tier.id} className="border rounded-lg p-4">
                    <h4 className="font-bold">Tier {tier.id}</h4>
                    <p>Monthly Fee: {tier.monthlyFee} BDG</p>
                    <p>Payout: {tier.payoutAmount} Rands</p>
                    <p>Status: {tier.active ? '✅ Active' : '❌ Inactive'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* User Management Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">User Management</h2>
          <div className="space-y-4">
            {users.map((user) => (
              <UserManagementCard 
                key={user.id} 
                user={user} 
                onUpdateTier={updateUserTier}
                onManualPayment={manualPayment}
                contractStats={contractStats}
                isLoading={isLoading}
              />
            ))}
          </div>
        </div>
      )}

      {/* Claims Tab */}
      {activeTab === 'claims' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Claims Management</h2>
          <div className="space-y-4">
            {claims.map((claim) => (
              <div key={claim.id} className="border rounded-lg p-6 bg-white">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p><strong>User:</strong> {claim.users?.wallet_address}</p>
                    <p><strong>Email:</strong> {claim.users?.email || 'N/A'}</p>
                    <p><strong>Tier:</strong> {claim.users?.tier}</p>
                    <p><strong>Total Paid:</strong> {claim.users?.total_paid || 0} BDG</p>
                    <p><strong>Document Hash:</strong> {claim.document_hash}</p>
                  </div>
                  <div>
                    <p><strong>Status:</strong> <span className={`px-2 py-1 rounded text-sm ${
                      claim.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      claim.status === 'approved' ? 'bg-green-100 text-green-800' :
                      claim.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{claim.status}</span></p>
                    <p><strong>Submitted:</strong> {new Date(claim.created_at).toLocaleDateString()}</p>
                    {claim.payout_amount && (
                      <>
                        <p><strong>Payout:</strong> {claim.payout_amount} Rands</p>
                        <p><strong>Installments:</strong> {claim.installments_paid}/{claim.installments_total}</p>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 flex space-x-2">
                  {claim.status === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          const amount = prompt('Enter payout amount in Rands:')
                          if (amount) approveClaim(claim, parseInt(amount))
                        }}
                        disabled={isLoading}
                        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => rejectClaim(claim.id)}
                        disabled={isLoading}
                        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  
                  {claim.status === 'approved' && claim.installments_paid < 4 && (
                    <button
                      onClick={() => processPayout(claim)}
                      disabled={isLoading}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      Process Next Payout ({claim.installments_paid + 1}/4)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {claims.length === 0 && (
            <p className="text-center text-gray-600">No claims to review.</p>
          )}
        </div>
      )}

      {/* System Tools Tab */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">System Tools</h2>
          
          {/* Contract Testing */}
          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-xl font-bold mb-4">Contract Testing</h3>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="font-semibold mb-2">Comprehensive Test</h4>
                <p className="text-gray-600 text-sm mb-3">Full system test with payment processing, claims, and payouts</p>
                <button
                  onClick={runComprehensiveTest}
                  disabled={isLoading}
                  className="w-full bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
                >
                  {isLoading ? '🔄 Running...' : '🧪 Run Comprehensive Test'}
                </button>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Basic Contract Test</h4>
                <p className="text-gray-600 text-sm mb-3">Original test-with-contract.js functionality</p>
                <button
                  onClick={runBasicContractTest}
                  disabled={isLoading}
                  className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {isLoading ? '🔄 Running...' : '🔧 Run Basic Test'}
                </button>
              </div>
            </div>
            
            {testResults && (
              <div className="mt-4 bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
                <pre>{testResults}</pre>
              </div>
            )}
          </div>

          {/* Manual Actions */}
          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-xl font-bold mb-4">Manual Actions</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={async () => {
                  setIsLoading(true)
                  try {
                    await loadContractStats()
                    await loadData()
                    alert('✅ Data refreshed!')
                  } catch (error: any) {
                    alert('❌ Refresh failed: ' + error.message)
                  } finally {
                    setIsLoading(false)
                  }
                }}
                disabled={isLoading}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
              >
                🔄 Refresh All Data
              </button>
              <button
                onClick={async () => {
                  if (confirm('This will deactivate ALL user authorizations. Continue?')) {
                    setIsLoading(true)
                    try {
                      await supabase
                        .from('authorizations')
                        .update({ is_active: false })
                      
                      await supabase
                        .from('users')
                        .update({ is_active: false })
                      
                      alert('✅ All users reset!')
                      loadData()
                    } catch (error: any) {
                      alert('❌ Reset failed: ' + error.message)
                    } finally {
                      setIsLoading(false)
                    }
                  }
                }}
                disabled={isLoading}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:opacity-50"
              >
                ⚠️ Reset All Users
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}