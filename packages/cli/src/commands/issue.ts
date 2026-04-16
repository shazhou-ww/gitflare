import { loadConfig } from '../config.js'
import { createApi } from '../api.js'

interface Issue {
  id: number
  number: number
  title: string
  body: string
  status: 'open' | 'closed'
  createdAt: string
  updatedAt: string
}

interface ApiResponse<T> {
  data: T
}

export async function issueList(ownerName: string, options: { json?: boolean } = {}): Promise<void> {
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
    const response = await api.get<ApiResponse<Issue[]>>(`/repos/${owner}/${name}/issues`)
    const issues = response.data

    if (options.json) {
      console.log(JSON.stringify(issues))
    } else {
      if (issues.length === 0) {
        console.log('No issues found')
      } else {
        console.log(`\nIssues for ${ownerName}:\n`)
        issues.forEach(issue => {
          const statusIcon = issue.status === 'open' ? '🟢' : '🔴'
          console.log(`${statusIcon} #${issue.number} ${issue.title}`)
          console.log(`   Created: ${new Date(issue.createdAt).toLocaleDateString()}`)
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

export async function issueCreate(
  ownerName: string,
  options: { title?: string; body?: string; json?: boolean } = {}
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

    if (!options.title) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Title is required' }))
      } else {
        console.error('❌ Title is required')
      }
      process.exit(1)
    }

    const api = createApi(config)
    const response = await api.post<ApiResponse<Issue>>(`/repos/${owner}/${name}/issues`, {
      title: options.title,
      body: options.body || ''
    })

    const issue = response.data

    if (options.json) {
      console.log(JSON.stringify(issue))
    } else {
      console.log(`✅ Issue created: #${issue.number} ${issue.title}`)
      if (issue.body) {
        console.log(`Body: ${issue.body}`)
      }
      console.log(`Status: ${issue.status}`)
      console.log(`Created: ${new Date(issue.createdAt).toLocaleDateString()}`)
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

export async function issueView(ownerName: string, issueNumber: string, options: { json?: boolean } = {}): Promise<void> {
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

    const number = issueNumber.replace('#', '') // Remove # if present
    const api = createApi(config)
    const response = await api.get<ApiResponse<Issue>>(`/repos/${owner}/${name}/issues/${number}`)
    const issue = response.data

    if (options.json) {
      console.log(JSON.stringify(issue))
    } else {
      const statusIcon = issue.status === 'open' ? '🟢' : '🔴'
      console.log(`\n${statusIcon} #${issue.number} ${issue.title}\n`)
      if (issue.body) {
        console.log(`${issue.body}\n`)
      }
      console.log(`Status: ${issue.status}`)
      console.log(`Created: ${new Date(issue.createdAt).toLocaleDateString()}`)
      console.log(`Updated: ${new Date(issue.updatedAt).toLocaleDateString()}`)
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

export async function issueClose(ownerName: string, issueNumber: string, options: { json?: boolean } = {}): Promise<void> {
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

    const number = issueNumber.replace('#', '') // Remove # if present
    const api = createApi(config)
    const response = await api.patch<ApiResponse<Issue>>(`/repos/${owner}/${name}/issues/${number}`, {
      status: 'closed'
    })

    const issue = response.data

    if (options.json) {
      console.log(JSON.stringify(issue))
    } else {
      console.log(`✅ Issue closed: #${issue.number} ${issue.title}`)
      console.log(`Status: ${issue.status}`)
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