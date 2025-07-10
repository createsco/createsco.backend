"use client"

import type React from "react"

import { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { fetchOnboardingStatus } from "@/lib/api/partner"

type OnboardingStatus = "incomplete" | "pending_verification" | "verified" | "rejected"

interface OnboardingContextType {
  currentStep: number
  onboardingStatus: OnboardingStatus
  onboardingProgress: number
  isLoading: boolean
  setCurrentStep: (step: number) => void
  refreshStatus: () => Promise<void>
  partnerData: any
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>("incomplete")
  const [onboardingProgress, setOnboardingProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [partnerData, setPartnerData] = useState<any>(null)
  const { user, loading, getIdToken } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const refreshStatus = async () => {
    if (!user || loading) return

    try {
      setIsLoading(true)
      const token = await getIdToken()
      const data = await fetchOnboardingStatus(token)

      setOnboardingStatus(data.onboardingStatus)
      setOnboardingProgress(data.onboardingProgress)
      setCurrentStep(data.onboardingStep)
      setPartnerData(data.profile)
    } catch (error) {
      console.error("Failed to fetch onboarding status:", error)
      toast({
        title: "Error",
        description: "Failed to load your onboarding status. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (user && user.userType !== "partner") {
      router.push("/dashboard")
      return
    }

    if (user && !loading) {
      refreshStatus()
    }
  }, [user, loading])

  return (
    <OnboardingContext.Provider
      value={{
        currentStep,
        onboardingStatus,
        onboardingProgress,
        isLoading,
        setCurrentStep,
        refreshStatus,
        partnerData,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export const useOnboarding = () => {
  const context = useContext(OnboardingContext)
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider")
  }
  return context
}
