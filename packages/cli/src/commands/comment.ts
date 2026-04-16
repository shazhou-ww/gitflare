import { loadConfig } from '../config.js'
import { createApi } from '../api.js'

interface Comment {
  id: number
  body: string
  authorUsername: string
  createdAt: string
  updatedAt: string
}

interface ApiResponse<T> {
  data: T
}

export async function commentList(
  ownerName: string,
  issueNumber: string,
  options: { json?: boolean } = {}
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

    const number = issueNumber.replace(/^#?/, '') // Remove # if present
    const api = createApi(config)
    const response = await api.get<ApiResponse<Comment[]>>(`/repos/${owner}/${name}/issues/${number}/comments`)
    const comments = response.data

    if (options.json) {
      console.log(JSON.stringify(comments))
    } else {
      if (comments.length === 0) {
        console.log(`No comments found for issue #${number}`)
      } else {
        console.log(`\nComments for ${ownerName}#${number}:\n`)
        comments.forEach(comment => {
          console.log(`💬 @${comment.authorUsername} • ${new Date(comment.createdAt).toLocaleString()}`)
          console.log(`   ${comment.body.split('\n').join('\n   ')}`)
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

export async function commentCreate(
  ownerName: string,
  issueNumber: string,
  options: { body?: string; json?: boolean } = {}
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

    if (!options.body) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Comment body is required. Use -b flag.' }))
      } else {
        console.error('❌ Comment body is required. Use -b flag.')
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

    const number = issueNumber.replace(/^#?/, '') // Remove # if present
    const api = createApi(config)
    const response = await api.post<ApiResponse<Comment>>(`/repos/${owner}/${name}/issues/${number}/comments`, {
      body: options.body
    })
    const comment = response.data

    if (options.json) {
      console.log(JSON.stringify(comment))
    } else {
      console.log(`✅ Comment added to issue #${number}`)
      console.log(`Author: @${comment.authorUsername}`)
      console.log(`Body: ${comment.body}`)
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