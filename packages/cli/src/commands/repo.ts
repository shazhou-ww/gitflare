import { loadConfig } from '../config.js'
import { createApi } from '../api.js'

interface Repository {
  id: number
  name: string
  description: string
  isPrivate: boolean
  owner: string
  createdAt: string
  updatedAt: string
}

interface ApiResponse<T> {
  data: T
}

export async function repoList(owner?: string, options: { json?: boolean } = {}): Promise<void> {
  try {
    const config = await loadConfig()
    if (!config.apiKey) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Not authenticated. Run `gf auth login` first.' }))
      } else {
        console.error('❌ Not authenticated. Run `gf auth login` first.')
      }
      process.exit(1)
    }

    const api = createApi(config)
    const targetOwner = owner || 'xiaomo' // Default to xiaomo if no owner specified
    
    const response = await api.get<ApiResponse<Repository[]>>(`/repos/${targetOwner}`)
    const repos = response.data

    if (options.json) {
      console.log(JSON.stringify(repos))
    } else {
      if (repos.length === 0) {
        console.log('No repositories found')
      } else {
        console.log(`\nRepositories for ${targetOwner}:\n`)
        repos.forEach(repo => {
          console.log(`📁 ${repo.name}`)
          if (repo.description) {
            console.log(`   ${repo.description}`)
          }
          console.log(`   ${repo.isPrivate ? '🔒 Private' : '🌍 Public'} • Created: ${new Date(repo.createdAt).toLocaleDateString()}`)
          console.log()
        })
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

export async function repoCreate(
  name: string, 
  options: { description?: string; private?: boolean; json?: boolean } = {}
): Promise<void> {
  try {
    const config = await loadConfig()
    if (!config.apiKey) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Not authenticated. Run `gf auth login` first.' }))
      } else {
        console.error('❌ Not authenticated. Run `gf auth login` first.')
      }
      process.exit(1)
    }

    const api = createApi(config)
    
    const response = await api.post<ApiResponse<Repository>>('/repos', {
      name,
      description: options.description || '',
      isPrivate: options.private || false
    })

    const repo = response.data

    if (options.json) {
      console.log(JSON.stringify(repo))
    } else {
      console.log(`✅ Repository created: ${repo.name}`)
      if (repo.description) {
        console.log(`Description: ${repo.description}`)
      }
      console.log(`Visibility: ${repo.isPrivate ? 'Private' : 'Public'}`)
      console.log(`URL: ${config.host}/${repo.owner}/${repo.name}`)
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

export async function repoView(ownerName: string, options: { json?: boolean } = {}): Promise<void> {
  try {
    const config = await loadConfig()
    if (!config.apiKey) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Not authenticated. Run `gf auth login` first.' }))
      } else {
        console.error('❌ Not authenticated. Run `gf auth login` first.')
      }
      process.exit(1)
    }

    const [owner, name] = ownerName.split('/')
    if (!owner || !name) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Repository must be in format "owner/name"' }))
      } else {
        console.error('❌ Repository must be in format "owner/name"')
      }
      process.exit(1)
    }

    const api = createApi(config)
    const response = await api.get<ApiResponse<Repository>>(`/repos/${owner}/${name}`)
    const repo = response.data

    if (options.json) {
      console.log(JSON.stringify(repo))
    } else {
      console.log(`\n📁 ${repo.name}\n`)
      if (repo.description) {
        console.log(`Description: ${repo.description}`)
      }
      console.log(`Owner: ${repo.owner}`)
      console.log(`Visibility: ${repo.isPrivate ? '🔒 Private' : '🌍 Public'}`)
      console.log(`Created: ${new Date(repo.createdAt).toLocaleDateString()}`)
      console.log(`Updated: ${new Date(repo.updatedAt).toLocaleDateString()}`)
      console.log(`URL: ${config.host}/${repo.owner}/${repo.name}`)
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