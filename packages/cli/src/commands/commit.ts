import { loadConfig } from '../config.js'
import { createApi } from '../api.js'

interface Commit {
  sha: string
  message: string
  author: {
    name: string
    email: string
    date: string
  }
  committer: {
    name: string
    email: string
    date: string
  }
}

interface ApiResponse<T> {
  data: T
}

export async function commitList(
  ownerName: string, 
  options: { branch?: string; limit?: string; json?: boolean } = {}
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
    const params = new URLSearchParams()
    if (options.branch) {
      params.set('ref', options.branch)
    }
    if (options.limit) {
      params.set('limit', options.limit)
    }
    
    const queryString = params.toString()
    const url = `/repos/${owner}/${name}/commits${queryString ? `?${queryString}` : ''}`
    
    const response = await api.get<ApiResponse<Commit[]>>(url)
    const commits = response.data

    if (options.json) {
      console.log(JSON.stringify(commits))
    } else {
      if (commits.length === 0) {
        console.log('No commits found')
      } else {
        const branch = options.branch || 'default branch'
        console.log(`\nCommits for ${ownerName} (${branch}):\n`)
        commits.forEach(commit => {
          console.log(`🔹 ${commit.sha.substring(0, 7)} ${commit.message}`)
          console.log(`   Author: ${commit.author.name} <${commit.author.email}>`)
          console.log(`   Date: ${new Date(commit.author.date).toLocaleString()}`)
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