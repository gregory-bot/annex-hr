/**
 * Writes the deterministic demo workspaces to backend/db/demo-data.json for the Python seeder.
 * Run after changing shared/src/seed.ts:  npm run export:demo-data
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { DEFAULT_TICKET_TEAMS, workspaceData } from '../src/seed'

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend/db/demo-data.json')
writeFileSync(out, JSON.stringify({ defaultTicketTeams: DEFAULT_TICKET_TEAMS, workspaces: workspaceData }, null, 1) + '\n')
console.log(`✓ Wrote ${Object.keys(workspaceData).length} demo workspaces to ${path.relative(process.cwd(), out)}`)
