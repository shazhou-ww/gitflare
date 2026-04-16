import { createInterface } from 'readline'
import { loadConfig, updateConfig } from '../config.js'
import { createApi } from '../api.js'

export async function authLogin(options: { json?: boolean }): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  try {
    const apiKey = await new Promise<string>((resolve) => {
      rl.question('Enter your API key: ', (answer) => {
        resolve(answer.trim())
      })
    })

    if (!apiKey) {
      console.error('API key is required')
      process.exit(1)
    }

    if (!apiKey.startsWith('gf')) {
      console.error('API key must start with "gf"')
      process.exit(1)
    }

    // Test the API key by trying to access user info
    const config = await loadConfig()
    const api = createApi({ ...config, apiKey })
    
    try {
      // Try to get repos for the current user (this will validate the token)
      await api.get('/repos/xiaomo')  // Using xiaomo as test - adjust if needed
      
      // If successful, save the config
      await updateConfig({ apiKey })
      
      if (options.json) {
        console.log(JSON.stringify({ success: true, message: 'Authentication successful' }))
      } else {
        console.log('✅ Authentication successful!')
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        }))
      } else {
        console.error('❌ Authentication failed:', error instanceof Error ? error.message : String(error))
      }
      process.exit(1)
    }
  } finally {
    rl.close()
  }
}

export async function authStatus(options: { json?: boolean }): Promise<void> {
  try {
    const config = await loadConfig()
    
    if (options.json) {
      console.log(JSON.stringify({
        authenticated: !!config.apiKey,
        host: config.host,
        username: config.username
      }))
    } else {
      if (config.apiKey) {
        console.log('✅ Authenticated')
        console.log(`Host: ${config.host}`)
        if (config.username) {
          console.log(`Username: ${config.username}`)
        }
      } else {
        console.log('❌ Not authenticated')
        console.log('Run `gf auth login` to authenticate')
      }
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      }))
    } else {
      console.error('Error:', error instanceof Error ? error.message : String(error))
    }
    process.exit(1)
  }
}