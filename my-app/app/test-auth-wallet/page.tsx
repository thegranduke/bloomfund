'use client'

import { useEffect } from 'react'
import AuthWalletConnection from '../../components/AuthWalletConnection'
import { testConnectionWithAuth } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { BrowserProvider, JsonRpcSigner } from 'ethers'

interface WalletData {
  user: User
  address: string
  provider: BrowserProvider
  signer: JsonRpcSigner
  chainId: bigint
}

export default function TestAuthWallet() {
  useEffect(() => {
    testConnectionWithAuth()
  }, [])

  const handleConnect = (data: WalletData) => {
    console.log('User + Wallet connected:', data)
    // Store this data in state or context
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Test Auth + Wallet Connection</h1>
      <AuthWalletConnection onConnect={handleConnect} />
    </div>
  )
}