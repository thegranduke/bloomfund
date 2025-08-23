'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { supabase } from '../../lib/supabase'

export default function AdminDashboard() {
  const [claims, setClaims] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

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

    // Get all users
    const { data: usersData } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    setUsers(usersData || [])
  }

  async function approveClaim(claim: any, payoutAmount: number) {
    setIsLoading(true)
    try {
      // Update database
      const { error } = await supabase
        .from('claims')
        .update({
          status: 'approved',
          payout_amount: payoutAmount,
          claim_start_date: new Date().toISOString()
        })
        .eq('id', claim.id)

      if (error) throw error

      // Call smart contract
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL)
      const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
      
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
        ['function approveClaim(address user, uint256 payoutAmount) external'],
        adminWallet
      )

      const tx = await contract.approveClaim(claim.users.wallet_address, payoutAmount)
      await tx.wait()

      alert('✅ Claim approved successfully!')
      loadData()
      
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
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL)
      const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
      
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
        ['function processPayout(address user) external'],
        adminWallet
      )

      const tx = await contract.processPayout(claim.users.wallet_address)
      await tx.wait()

      // Update database
      await supabase
        .from('claims')
        .update({
          installments_paid: claim.installments_paid + 1,
          status: claim.installments_paid + 1 >= 4 ? 'completed' : 'approved'
        })
        .eq('id', claim.id)

      alert('✅ Payout processed!')
      loadData()
      
    } catch (error: any) {
      alert('Payout failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      {/* System Stats */}
      <div className="mb-8 grid md:grid-cols-4 gap-4">
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
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="font-bold text-gray-800">Total Claims</h3>
          <p className="text-2xl font-bold text-gray-600">{claims.length}</p>
        </div>
      </div>

      {/* Claims Management */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Claims Management</h2>
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
      </div>
      
      {claims.length === 0 && (
        <p className="text-center text-gray-600">No claims to review.</p>
      )}
    </div>
  )
}