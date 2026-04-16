import { loadConfig } from '../config.js'
import { createApi } from '../api.js'

interface TreeEntry {
  name: string
  type: 'file' | 'dir'
  mode: string
  size?: number
  oid?: string
}

interface TreeResponse {
  entries: TreeEntry[]
  path: string
  ref: string
}

interface ApiResponse<T> {
  data: T
}

export async function treeList(
  ownerName: string,
  path?: string,
  options: { branch?: string; json?: boolean } = {}
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
    if (path) {
      params.set('path', path)
    }
    
    const queryString = params.toString()
    const url = `/repos/${owner}/${name}/tree${queryString ? `?${queryString}` : ''}`
    
    const response = await api.get<ApiResponse<TreeResponse>>(url)
    const tree = response.data

    if (options.json) {
      console.log(JSON.stringify(tree))
    } else {
      const branch = tree.ref || options.branch || 'default branch'
      const currentPath = tree.path || path || '/'
      console.log(`\n📁 ${ownerName}:${branch} ${currentPath}\n`)
      
      if (tree.entries.length === 0) {
        console.log('Empty directory')
      } else {
        // Sort entries: directories first, then files
        const sortedEntries = tree.entries.sort((a, b) => {
          if (a.type === 'dir' && b.type === 'file') return -1
          if (a.type === 'file' && b.type === 'dir') return 1
          return a.name.localeCompare(b.name)
        })

        sortedEntries.forEach(entry => {
          const icon = entry.type === 'dir' ? '📁' : '📄'
          const sizeInfo = entry.size !== undefined ? ` (${formatFileSize(entry.size)})` : ''
          console.log(`${icon} ${entry.name}${sizeInfo}`)
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

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}