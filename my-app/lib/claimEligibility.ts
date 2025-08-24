// Claim eligibility and validation utilities
// Integrates with existing contract validation patterns from test-with-contract.js

import { ethers } from 'ethers'

export interface ClaimEligibility {
  eligible: boolean
  reason?: string
  monthsPaid: number
  totalPaid: string // in BDG
  lastPayment?: Date
  requiredMonths: number
}

export interface ContractClaimData {
  user: string
  policyTier: bigint
  payoutAmount: bigint
  installmentsPaid: bigint
  totalInstallments: bigint
  approvedAt: bigint
  active: boolean
}

/**
 * Check if user is eligible to submit a claim
 * Based on contract logic: 6 months of payments required
 */
export async function checkClaimEligibility(
  contract: ethers.Contract,
  userAddress: string,
  tierMonthlyFee: bigint
): Promise<ClaimEligibility> {
  try {
    // Get user policy from contract
    const policy = await contract.getUserPolicy(userAddress)
    
    if (!policy.active) {
      return {
        eligible: false,
        reason: 'No active policy',
        monthsPaid: 0,
        totalPaid: '0',
        requiredMonths: 6
      }
    }

    // Calculate months paid based on total paid amount
    const monthsPaid = policy.totalPaid > BigInt(0) ? Number(policy.totalPaid / tierMonthlyFee) : 0
    const totalPaidBDG = ethers.formatEther(policy.totalPaid)
    
    // Check if user has paid for at least 6 months
    const requiredMonths = 6
    const eligible = monthsPaid >= requiredMonths
    
    let reason: string | undefined
    if (!eligible) {
      reason = `Need ${requiredMonths} months of payments, have ${monthsPaid}`
    }

    let lastPayment: Date | undefined
    if (policy.lastPaidAt > BigInt(0)) {
      lastPayment = new Date(Number(policy.lastPaidAt) * 1000)
    }

    return {
      eligible,
      reason,
      monthsPaid,
      totalPaid: totalPaidBDG,
      lastPayment,
      requiredMonths
    }
  } catch (error) {
    return {
      eligible: false,
      reason: `Contract error: ${error}`,
      monthsPaid: 0,
      totalPaid: '0',
      requiredMonths: 6
    }
  }
}

/**
 * Get claim data from contract
 */
export async function getContractClaim(
  contract: ethers.Contract,
  claimId: number
): Promise<ContractClaimData | null> {
  try {
    const claim = await contract.getClaim(claimId)
    
    if (claim.user === ethers.ZeroAddress) {
      return null
    }

    return {
      user: claim.user,
      policyTier: claim.policyTier,
      payoutAmount: claim.payoutAmount,
      installmentsPaid: claim.installmentsPaid,
      totalInstallments: claim.totalInstallments,
      approvedAt: claim.approvedAt,
      active: claim.active
    }
  } catch (error) {
    console.error('Error fetching claim from contract:', error)
    return null
  }
}