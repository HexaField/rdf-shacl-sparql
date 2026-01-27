import { expect, test } from '@playwright/test'

test('has title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Solid App/)
})

test('shows server message', async ({ page }) => {
  const apiUrl = process.env.VITE_API_URL || 'https://localhost:3002/graphql'
  await page.route(apiUrl, async (route) => {
    const json = {
      data: {
        me: {
          did: 'did:key:z6MkhaX',
          perspective: { name: 'Public Profile' }
        }
      }
    }
    await route.fulfill({ json })
  })

  await page.goto('/')

  // The Home component sets message to: `Agent: ${did}... | Perspective: ${name}`
  await expect(page.getByText('Agent: did:key:z6MkhaX... | Perspective: Public Profile')).toBeVisible()
})
