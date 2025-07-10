import { API_URL } from "@/lib/config"

// Fetch onboarding status
export async function fetchOnboardingStatus(token: string) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch onboarding status")
  }

  const data = await response.json()
  return data.data
}

// Submit basic info (Step 1)
export async function submitBasicInfo(token: string, formData: any) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/basic-info`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formData),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to submit basic information")
  }

  const data = await response.json()
  return data.data
}

// Add service (Step 2)
export async function addService(token: string, serviceData: any) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/services`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(serviceData),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to add service")
  }

  const data = await response.json()
  return data.data
}

// Update service
export async function updateService(token: string, serviceId: string, serviceData: any) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/services/${serviceId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(serviceData),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to update service")
  }

  const data = await response.json()
  return data.data
}

// Delete service
export async function deleteService(token: string, serviceId: string) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/services/${serviceId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to delete service")
  }

  const data = await response.json()
  return data.data
}

// Submit locations (Step 3)
export async function submitLocations(token: string, locationData: any) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/locations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(locationData),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to submit location information")
  }

  const data = await response.json()
  return data.data
}

// Upload portfolio (Step 4)
export async function uploadPortfolio(token: string, portfolioUrls: string[]) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/portfolio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ portfolioUrls }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to upload portfolio")
  }

  const data = await response.json()
  return data.data
}

// Delete portfolio image
export async function deletePortfolioImage(token: string, imageUrl: string) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/portfolio`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageUrl }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to delete portfolio image")
  }

  const data = await response.json()
  return data.data
}

// Upload documents (Step 5)
export async function uploadDocuments(token: string, documents: { docName: string; fileUrl: string }[]) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ documents }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to upload documents")
  }

  const data = await response.json()
  return data.data
}

// Get document status
export async function getDocumentStatus(token: string) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/documents`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to fetch document status")
  }

  const data = await response.json()
  return data.data
}

// Complete onboarding
export async function completeOnboarding(token: string) {
  const response = await fetch(`${API_URL}/api/v1/partner-onboarding/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to complete onboarding")
  }

  const data = await response.json()
  return data.data
}
