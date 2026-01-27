export function getBaseUrl(): string {
  const params = new URLSearchParams(window.location.search)
  const port = params.get('port')

  if (port) {
    return `https://localhost:${port}`
  }

  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl) {
    // If envUrl ends with /graphql, strip it
    return envUrl.replace(/\/graphql$/, '')
  }

  return 'https://localhost:3001'
}

export function getApiUrl(): string {
  const params = new URLSearchParams(window.location.search)
  const port = params.get('port')

  if (port) {
    return `https://localhost:${port}/graphql`
  }

  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl) {
    // If envUrl doesn't end with /graphql, append it?
    // The current .env has it appended.
    // But if we stripped it for base, we rely on it being there or not.
    // Let's assume strict adherence to .env or default.
    return envUrl
  }

  return 'https://localhost:3001/graphql'
}
