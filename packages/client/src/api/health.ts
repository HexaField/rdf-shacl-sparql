import { getBaseUrl } from '../utils/connection'

/**
 * Fetches the health status from the API.
 * @returns A promise that resolves to the health status message and status.
 */
export const fetchHealth = async () => {
  const url = getBaseUrl()
  const res = await fetch(`${url}/health`)
  if (!res.ok) {
    throw new Error('Network response was not ok')
  }
  return res.json() as Promise<{ message: string; status: string }>
}
