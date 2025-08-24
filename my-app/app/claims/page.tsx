'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { supabase } from '../../lib/supabase'
import { checkClaimEligibility, type ClaimEligibility } from '../../lib/claimEligibility'

export default function ClaimsPage() {
  const [user, setUser] = useState<any>(null)
  const [userRecord, setUserRecord] = useState<any>(null)
  const [claims, setClaims] = useState<any[]>([])
  const [eligibility, setEligibility] = useState<ClaimEligibility | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (userRecord) {
      checkContractEligibility()
    }
  }, [userRecord])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUser(user)
      
      // Get user record with tier info
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()
      
      setUserRecord(userData)
      
      // Get user's claims
      const { data: claimsData } = await supabase
        .from('claims')
        .select('*')
        .eq('user_id', userData?.id)
        .order('created_at', { ascending: false })
      
      setClaims(claimsData || [])
    }
  }

  async function checkContractEligibility() {
    if (!userRecord) return
    
    setIsCheckingEligibility(true)
    try {
      // Connect to contract for real-time eligibility check
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL)
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
        [
          'function getUserPolicy(address user) external view returns (uint256 tier, uint256 lastPaidAt, uint256 totalPaid, bool active)',
          'function getTier(uint256 tierId) external view returns (uint256 monthlyFee, uint256 payoutAmount, bool active)'
        ],
        provider
      )
      
      // Get tier monthly fee for calculation
      const tier = await contract.getTier(userRecord.tier)
      
      // Check eligibility using contract data
      const eligibilityResult = await checkClaimEligibility(
        contract,
        userRecord.wallet_address,
        tier.monthlyFee
      )
      
      setEligibility(eligibilityResult)
    } catch (error) {
      console.error('Error checking contract eligibility:', error)
      setEligibility({
        eligible: false,
        reason: 'Unable to check contract status',
        monthsPaid: 0,
        totalPaid: '0',
        requiredMonths: 6
      })
    } finally {
      setIsCheckingEligibility(false)
    }
  }

  async function submitClaim() {
    if (!user || !userRecord) {
      alert('Please complete onboarding first')
      return
    }

    // Use contract-based eligibility check
    if (!eligibility?.eligible) {
      alert(`Cannot submit claim: ${eligibility?.reason || 'Not eligible'}`)
      return
    }

    // Check for active claims
    const activeClaim = claims.find(c => c.status === 'pending' || c.status === 'approved')
    if (activeClaim) {
      alert('You already have an active claim')
      return
    }

    const documentHash = prompt('Enter document hash (birth certificate hash):')
    if (!documentHash) return

    setIsLoading(true)
    try {
      // Submit to database
      const { error } = await supabase
        .from('claims')
        .insert({
          user_id: userRecord.id,
          document_hash: documentHash,
          status: 'pending',
          installments_total: 4,
          installments_paid: 0
        })

      if (error) throw error
      
      alert('✅ Claim submitted successfully! Awaiting admin verification.')
      checkUser() // Refresh claims
      
    } catch (error: any) {
      alert('Claim submission failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold mb-8">Submit Insurance Claim</h1>
        <p>Please sign in to submit a claim.</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Submit Insurance Claim</h1>
      
      {/* User Info */}
      <div className="mb-8 p-6 bg-blue-50 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Your Coverage</h2>
        {userRecord ? (
          <div>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Tier:</strong> {userRecord.tier}</p>
            <p><strong>Monthly Premium:</strong> {userRecord.monthly_fee} BDG</p>
            <p><strong>Total Paid:</strong> {userRecord.total_paid || 0} BDG</p>
            <p><strong>Last Payment:</strong> {userRecord.last_paid_at ? new Date(userRecord.last_paid_at).toLocaleDateString() : 'Never'}</p>
          </div>
        ) : (
          <p>Loading your coverage information...</p>
        )}
      </div>

      {/* Contract-based Eligibility Status */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">Claim Eligibility Status</h2>
        {isCheckingEligibility ? (
          <div className="bg-yellow-50 p-4 rounded-lg">
            <p>🔄 Checking eligibility with smart contract...</p>
          </div>
        ) : eligibility ? (
          <div className={`p-4 rounded-lg ${eligibility.eligible ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center mb-2">
              <span className={`text-2xl mr-2 ${eligibility.eligible ? 'text-green-600' : 'text-red-600'}`}>
                {eligibility.eligible ? '✅' : '❌'}
              </span>
              <span className={`font-bold ${eligibility.eligible ? 'text-green-800' : 'text-red-800'}`}>
                {eligibility.eligible ? 'Eligible for Claims' : 'Not Eligible'}
              </span>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <p><strong>Months Paid:</strong> {eligibility.monthsPaid}/{eligibility.requiredMonths}</p>
                <p><strong>Total Paid (Contract):</strong> {eligibility.totalPaid} BDG</p>
              </div>
              <div>
                {eligibility.lastPayment && (
                  <p><strong>Last Payment:</strong> {eligibility.lastPayment.toLocaleDateString()}</p>
                )}
                {!eligibility.eligible && eligibility.reason && (
                  <p className="text-red-700"><strong>Reason:</strong> {eligibility.reason}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 p-4 rounded-lg">
            <p>Loading eligibility status...</p>
          </div>
        )}
      </div>

      {/* Claims History */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">Your Claims</h2>
        {claims.length === 0 ? (
          <p className="text-gray-600">No claims submitted yet.</p>
        ) : (
          <div className="space-y-4">
            {claims.map((claim) => (
              <div key={claim.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p><strong>Status:</strong> <span className={`px-2 py-1 rounded text-sm ${
                      claim.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      claim.status === 'approved' ? 'bg-green-100 text-green-800' :
                      claim.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{claim.status}</span></p>
                    <p><strong>Document Hash:</strong> {claim.document_hash}</p>
                    <p><strong>Submitted:</strong> {new Date(claim.created_at).toLocaleDateString()}</p>
                    {claim.payout_amount && (
                      <p><strong>Payout:</strong> {claim.payout_amount} Rands over 4 months ({claim.installments_paid}/{claim.installments_total} paid)</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit New Claim */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Submit New Claim</h2>
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <h3 className="font-bold text-yellow-800 mb-2">Requirements:</h3>
          <ul className="list-disc list-inside text-yellow-700 space-y-1">
            <li>Must have paid premiums for at least 6 months</li>
            <li>No active claims in progress</li>
            <li>Valid birth certificate or supporting document</li>
            <li>Document must be hashed and uploaded off-chain</li>
          </ul>
        </div>
        
        <button
          onClick={submitClaim}
          disabled={isLoading}
          className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? 'Submitting...' : 'Submit Claim'}
        </button>
      </div>
    </div>
  )
}