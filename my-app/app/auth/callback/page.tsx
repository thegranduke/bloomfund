'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { data, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Auth callback error:', error)
        router.push('/?error=auth_error')
      } else if (data.session) {
        console.log('User authenticated successfully')
        router.push('/')
      }
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="container mx-auto p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Completing sign in...</h1>
      <p>Please wait while we redirect you.</p>
    </div>
  )
}