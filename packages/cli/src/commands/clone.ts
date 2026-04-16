import { spawn } from 'child_process'
import { resolve } from 'path'
import { loadConfig } from '../config.js'

export async function cloneRepo(ownerName: string, targetDir?: string, options: { json?: boolean } = {}): Promise<void> {
  try {
    const config = await loadConfig()
    
    const [owner, name] = ownerName.split('/')
    if (!owner || !name) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Repository must be in format "owner/name"' }))
      } else {
        console.error('❌ Repository must be in format "owner/name"')
      }
      process.exit(1)
    }

    const repoUrl = `${config.host}/${owner}/${name}.git`
    const directory = targetDir || name
    const fullPath = resolve(directory)

    if (!options.json) {
      console.log(`🔄 Cloning ${ownerName} into ${directory}...`)
    }

    // Execute git clone
    const gitProcess = spawn('git', ['clone', repoUrl, directory], {
      stdio: options.json ? 'pipe' : 'inherit'
    })

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      let errorOutput = ''

      if (options.json && gitProcess.stderr) {
        gitProcess.stderr.on('data', (data) => {
          errorOutput += data.toString()
        })
      }

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true })
        } else {
          resolve({ 
            success: false, 
            error: options.json ? errorOutput : `Git clone failed with exit code ${code}` 
          })
        }
      })

      gitProcess.on('error', (error) => {
        resolve({ 
          success: false, 
          error: error.message 
        })
      })
    })

    if (!result.success) {
      if (options.json) {
        console.log(JSON.stringify({ 
          success: false, 
          error: result.error 
        }))
      } else {
        console.error('❌ Clone failed:', result.error)
      }
      process.exit(1)
    }

    // If we have an API key, configure git authentication for future operations
    if (config.apiKey && result.success) {
      try {
        // Configure git to use the API key for this repository
        const gitConfigProcess = spawn('git', [
          'config',
          'remote.origin.url',
          `https://oauth2:${config.apiKey}@${new URL(config.host).host}/${owner}/${name}.git`
        ], {
          cwd: fullPath,
          stdio: 'pipe'
        })

        await new Promise<void>((resolve) => {
          gitConfigProcess.on('close', () => {
            resolve()
          })
        })
      } catch (configError) {
        // Non-fatal error - the clone succeeded, just couldn't configure auth
        if (!options.json) {
          console.warn('⚠️  Warning: Could not configure git authentication')
        }
      }
    }

    if (options.json) {
      console.log(JSON.stringify({ 
        success: true, 
        path: fullPath,
        repository: ownerName
      }))
    } else {
      console.log(`✅ Successfully cloned ${ownerName} to ${directory}`)
      if (config.apiKey) {
        console.log('🔐 Git authentication configured for future operations')
      }
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      }))
    } else {
      console.error('Error:', error instanceof Error ? error.message : String(error))
    }
    process.exit(1)
  }
}