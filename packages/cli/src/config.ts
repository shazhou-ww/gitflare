import { homedir } from 'os'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'

export interface Config {
  host: string
  apiKey?: string
  username?: string
}

const DEFAULT_CONFIG: Config = {
  host: 'https://git.shazhou.work'
}

const CONFIG_DIR = join(homedir(), '.config', 'gf')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export async function loadConfig(): Promise<Config> {
  try {
    const data = await readFile(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(data)
    return { ...DEFAULT_CONFIG, ...config }
  } catch (error) {
    return DEFAULT_CONFIG
  }
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true })
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch (error) {
    throw new Error(`Failed to save config: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const config = await loadConfig()
  const updated = { ...config, ...updates }
  await saveConfig(updated)
  return updated
}