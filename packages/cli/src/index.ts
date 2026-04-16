#!/usr/bin/env node
import { authLogin, authStatus } from './commands/auth.js'
import { repoList, repoCreate, repoView, repoDelete } from './commands/repo.js'
import { issueList, issueCreate, issueView, issueClose } from './commands/issue.js'
import { cloneRepo } from './commands/clone.js'
import { branchList } from './commands/branch.js'
import { commitList } from './commands/commit.js'
import { commentList, commentCreate } from './commands/comment.js'
import { treeList } from './commands/tree.js'

// Simple argument parser
class ArgParser {
  private args: string[]
  private options: Record<string, string | boolean> = {}
  private positional: string[] = []

  constructor(args: string[]) {
    this.args = args.slice(2) // Remove node and script name
    this.parse()
  }

  private parse() {
    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i]
      if (!arg) continue
      
      if (arg.startsWith('--')) {
        const key = arg.slice(2)
        const nextArg = this.args[i + 1]
        
        if (nextArg && !nextArg.startsWith('-')) {
          this.options[key] = nextArg
          i++ // Skip next arg
        } else {
          this.options[key] = true
        }
      } else if (arg.startsWith('-')) {
        const key = arg.slice(1)
        const nextArg = this.args[i + 1]
        
        if (nextArg && !nextArg.startsWith('-')) {
          this.options[key] = nextArg
          i++ // Skip next arg
        } else {
          this.options[key] = true
        }
      } else {
        this.positional.push(arg)
      }
    }
  }

  get(key: string): string | boolean | undefined {
    return this.options[key]
  }

  getPositional(): string[] {
    return this.positional
  }

  has(key: string): boolean {
    return key in this.options
  }
}

function showHelp() {
  console.log(`
Gitflare CLI - gf

Usage:
  gf <command> [options]

Commands:
  auth login              Interactive API key setup
  auth status             Show authentication status

  repo list [owner]       List repositories
  repo create <name>      Create a new repository
    -d, --description     Repository description
    --private             Make repository private
  repo view <owner/name>  View repository details
  repo delete <owner/name> Delete a repository

  branch list <owner/name>           List branches

  commit list <owner/name>           List commits
    --branch              Branch name (default: current branch)
    --limit               Number of commits to show

  issue list <owner/name>           List issues
  issue create <owner/name>         Create a new issue
    -t, --title           Issue title (required)
    -b, --body            Issue body
  issue view <owner/name> <#number> View issue details
  issue close <owner/name> <#number> Close an issue

  comment list <owner/name> <#number>      List issue comments
  comment create <owner/name> <#number>    Create a comment
    -b, --body            Comment body (required)

  tree <owner/name> [path]          Browse file tree
    --branch              Branch name (default: current branch)

  clone <owner/name> [dir]          Clone repository

Global options:
  --json                  Output JSON format
  -h, --help              Show help

Examples:
  gf auth login
  gf repo list scottwei
  gf repo create my-project -d "My awesome project"
  gf repo delete xiaomo/old-project
  gf branch list xiaomo/test-api
  gf commit list xiaomo/test-api --branch main --limit 10
  gf issue list xiaomo/test-api
  gf issue create xiaomo/test-api -t "Bug report" -b "Something is broken"
  gf comment list xiaomo/test-api 1
  gf comment create xiaomo/test-api 1 -b "Thanks for reporting!"
  gf tree xiaomo/test-api src --branch main
  gf clone xiaomo/test-api
`)
}

async function main() {
  const parser = new ArgParser(process.argv)
  const args = parser.getPositional()
  const jsonMode = parser.has('json')

  if (args.length === 0 || parser.has('help') || parser.has('h')) {
    showHelp()
    return
  }

  const [command, subcommand, ...rest] = args

  try {
    switch (command) {
      case 'auth':
        switch (subcommand) {
          case 'login':
            await authLogin({ json: jsonMode })
            break
          case 'status':
            await authStatus({ json: jsonMode })
            break
          default:
            console.error('Unknown auth command. Available: login, status')
            process.exit(1)
        }
        break

      case 'repo':
        switch (subcommand) {
          case 'list':
            await repoList(rest[0], { json: jsonMode })
            break
          case 'create':
            if (!rest[0]) {
              console.error('Repository name is required')
              process.exit(1)
            }
            await repoCreate(rest[0], {
              description: parser.get('description') as string || parser.get('d') as string,
              private: parser.has('private'),
              json: jsonMode
            })
            break
          case 'view':
            if (!rest[0]) {
              console.error('Repository name is required (format: owner/name)')
              process.exit(1)
            }
            await repoView(rest[0], { json: jsonMode })
            break
          case 'delete':
            if (!rest[0]) {
              console.error('Repository name is required (format: owner/name)')
              process.exit(1)
            }
            await repoDelete(rest[0], { json: jsonMode })
            break
          default:
            console.error('Unknown repo command. Available: list, create, view, delete')
            process.exit(1)
        }
        break

      case 'issue':
        switch (subcommand) {
          case 'list':
            if (!rest[0]) {
              console.error('Repository name is required (format: owner/name)')
              process.exit(1)
            }
            await issueList(rest[0], { json: jsonMode })
            break
          case 'create':
            if (!rest[0]) {
              console.error('Repository name is required (format: owner/name)')
              process.exit(1)
            }
            await issueCreate(rest[0], {
              title: parser.get('title') as string || parser.get('t') as string,
              body: parser.get('body') as string || parser.get('b') as string,
              json: jsonMode
            })
            break
          case 'view':
            if (!rest[0] || !rest[1]) {
              console.error('Repository name and issue number are required')
              process.exit(1)
            }
            await issueView(rest[0], rest[1], { json: jsonMode })
            break
          case 'close':
            if (!rest[0] || !rest[1]) {
              console.error('Repository name and issue number are required')
              process.exit(1)
            }
            await issueClose(rest[0], rest[1], { json: jsonMode })
            break
          default:
            console.error('Unknown issue command. Available: list, create, view, close')
            process.exit(1)
        }
        break

      case 'branch':
        switch (subcommand) {
          case 'list':
            if (!rest[0]) {
              console.error('Repository name is required (format: owner/name)')
              process.exit(1)
            }
            await branchList(rest[0], { json: jsonMode })
            break
          default:
            console.error('Unknown branch command. Available: list')
            process.exit(1)
        }
        break

      case 'commit':
        switch (subcommand) {
          case 'list':
            if (!rest[0]) {
              console.error('Repository name is required (format: owner/name)')
              process.exit(1)
            }
            await commitList(rest[0], {
              branch: parser.get('branch') as string,
              limit: parser.get('limit') as string,
              json: jsonMode
            })
            break
          default:
            console.error('Unknown commit command. Available: list')
            process.exit(1)
        }
        break

      case 'comment':
        switch (subcommand) {
          case 'list':
            if (!rest[0] || !rest[1]) {
              console.error('Repository name and issue number are required')
              process.exit(1)
            }
            await commentList(rest[0], rest[1], { json: jsonMode })
            break
          case 'create':
            if (!rest[0] || !rest[1]) {
              console.error('Repository name and issue number are required')
              process.exit(1)
            }
            await commentCreate(rest[0], rest[1], {
              body: parser.get('body') as string || parser.get('b') as string,
              json: jsonMode
            })
            break
          default:
            console.error('Unknown comment command. Available: list, create')
            process.exit(1)
        }
        break

      case 'tree':
        // For tree command, subcommand is actually the repo name
        const treeRepoName = subcommand
        const treePath = rest[0]
        if (!treeRepoName) {
          console.error('Repository name is required (format: owner/name)')
          process.exit(1)
        }
        await treeList(treeRepoName, treePath, {
          branch: parser.get('branch') as string,
          json: jsonMode
        })
        break

      case 'clone':
        // For clone command, subcommand is actually the repo name
        const repoName = subcommand
        const targetDir = rest[0]
        if (!repoName) {
          console.error('Repository name is required (format: owner/name)')
          process.exit(1)
        }
        await cloneRepo(repoName, targetDir, { json: jsonMode })
        break

      default:
        console.error(`Unknown command: ${command}`)
        console.error('Run `gf --help` for usage information')
        process.exit(1)
    }
  } catch (error) {
    if (jsonMode) {
      console.log(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      }))
    } else {
      console.error('Error:', error instanceof Error ? error.message : String(error))
    }
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})