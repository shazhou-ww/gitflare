import { loadConfig } from '../config.js'
import { createApi } from '../api.js'

interface Branch {
  name: string
  commit: {
    sha: string
    message: string
    author: {
      name: string
      email: string
      date: string
    }
  }
}

interface BranchResponse {
  branches: Branch[]
  currentBranch: string
}

interface ApiResponse<T> {
  data: T
}

export async function branchList(ownerName: string, options: { json?: boolean } = {}): Promise<void> {
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
    const response = await api.get<ApiResponse<BranchResponse>>(`/repos/${owner}/${name}/branches`)
    const branchData = response.data

    if (options.json) {
      console.log(JSON.stringify(branchData))
    } else {
      if (branchData.branches.length === 0) {
        console.log('No branches found')
      } else {
        console.log(`\nBranches for ${ownerName}:\n`)
        branchData.branches.forEach(branch => {
          const current = branch.name === branchData.currentBranch ? '* ' : '  '
          console.log(`${current}${branch.name}`)
          console.log(`    ${branch.commit.sha.substring(0, 7)} ${branch.commit.message}`)
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