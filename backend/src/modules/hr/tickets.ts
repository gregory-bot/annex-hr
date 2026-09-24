import { Router, type Request } from 'express'
import type pg from 'pg'
import { z } from 'zod'
import { query, tx } from '../../db/pool'
import { buildUpdate } from '../../db/sql'
import { audit } from '../../lib/audit'
import { badRequest, forbidden, notFound, parse } from '../../lib/http'
import { isExec, isLeader } from '../../lib/roles'
import { auth, type AuthContext } from '../../middleware/auth'
import { TICKET_SELECT, toTicket } from '../workspace/repository'
import { isoDate } from './helpers'

export const ticketsRouter = Router()

const STATUSES = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled'] as const
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low', 'None'] as const

const label = z.string().trim().toLowerCase().min(1).max(32)
const labels = z.array(label).max(10).transform((l) => [...new Set(l)])

/** Params for TICKET_SELECT: workspace, viewer, and whether the viewer may see private (HR) tickets. */
const scope = (me: AuthContext) => [me.workspaceId, me.employeeId, isExec(me.role)]

async function loadTicket(db: pg.PoolClient, me: AuthContext, id: string, lock = false) {
  if (lock) await db.query('SELECT 1 FROM tickets WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [id, me.workspaceId])
  const { rows } = await db.query(`${TICKET_SELECT} AND t.id = $4`, [...scope(me), id])
  if (!rows[0]) throw notFound('Ticket')
  return rows[0] as Record<string, any>
}

async function lockTeam(db: pg.PoolClient, workspaceId: string, teamId: string) {
  const { rows } = await db.query<{ id: string; key: string; name: string }>('SELECT id, key, name FROM ticket_teams WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [teamId, workspaceId])
  if (!rows[0]) throw badRequest('Unknown team')
  // Holding the team row lock serialises number allocation for this team.
  const { rows: seq } = await db.query<{ next: number }>('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM tickets WHERE team_id = $1', [teamId])
  return { team: rows[0], number: Number(seq[0]!.next) }
}

async function assertEmployee(db: pg.PoolClient, workspaceId: string, employeeId: string) {
  const { rowCount } = await db.query("SELECT 1 FROM employees WHERE id = $1 AND workspace_id = $2 AND status <> 'Exited'", [employeeId, workspaceId])
  if (!rowCount) throw badRequest('Assignee must be an active member of this workspace')
}

async function notifyAssignee(db: pg.PoolClient, req: Request, assigneeId: string, ticket: { id: string; identifier: string; title: string }) {
  const me = auth(req)
  if (assigneeId === me.employeeId) return
  await db.query(
    `INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href)
     SELECT $1, $2, 'system', $3, e.name || ' assigned this ticket to you.', $4 FROM employees e WHERE e.id = $5`,
    [me.workspaceId, assigneeId, `${ticket.identifier} · ${ticket.title}`, `/app/tickets?id=${encodeURIComponent(ticket.id)}`, me.employeeId],
  )
}

// ── List & read ─────────────────────────────────────────────────────
ticketsRouter.get('/tickets', async (req, res) => {
  const me = auth(req)
  const f = parse(
    z.object({
      team: z.string().trim().max(64).optional(),
      status: z.string().optional(),
      assignee: z.literal('me').optional(),
      reporter: z.literal('me').optional(),
      q: z.string().trim().max(120).optional(),
    }),
    req.query,
  )
  const statuses = f.status ? parse(z.array(z.enum(STATUSES)), f.status.split(',')) : null
  const params: unknown[] = [...scope(me)]
  const where: string[] = []
  if (f.team) {
    params.push(f.team)
    where.push(`(t.team_id = $${params.length} OR tm.key = upper($${params.length}))`)
  }
  if (statuses) {
    params.push(statuses)
    where.push(`t.status = ANY ($${params.length}::text[])`)
  }
  if (f.assignee) where.push('t.assignee_id = $2')
  if (f.reporter) where.push('t.reporter_id = $2')
  if (f.q) {
    params.push(`%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    where.push(`(t.title ILIKE $${params.length} OR t.identifier ILIKE $${params.length} OR t.description ILIKE $${params.length})`)
  }
  const rows = await query(`${TICKET_SELECT}${where.map((w) => ` AND ${w}`).join('')} ORDER BY t.updated_at DESC LIMIT 500`, params)
  res.json(rows.map(toTicket))
})

ticketsRouter.get('/tickets/:id', async (req, res) => {
  const me = auth(req)
  const [row] = await query(`${TICKET_SELECT} AND (t.id = $4 OR t.identifier = upper($4))`, [...scope(me), req.params.id])
  if (!row) throw notFound('Ticket')
  res.json(toTicket(row))
})

// ── Create ──────────────────────────────────────────────────────────
const createSchema = z.object({
  teamId: z.string().min(1),
  title: z.string().trim().min(3, 'Give the ticket a short title').max(200),
  description: z.string().trim().max(10_000).default(''),
  status: z.enum(STATUSES).default('Todo'),
  priority: z.enum(PRIORITIES).default('None'),
  assigneeId: z.string().min(1).nullish(),
  labels: labels.default([]),
  dueDate: z.string().regex(isoDate).nullish(),
})

ticketsRouter.post('/tickets', async (req, res) => {
  const me = auth(req)
  const b = parse(createSchema, req.body)
  const ticket = await tx(async (db) => {
    const { team, number } = await lockTeam(db, me.workspaceId, b.teamId)
    if (b.assigneeId) await assertEmployee(db, me.workspaceId, b.assigneeId)
    const identifier = `${team.key}-${number}`
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO tickets (workspace_id, team_id, number, identifier, title, description, status, priority, reporter_id, assignee_id, labels, due_date, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $7 = 'Done' THEN now() END) RETURNING id`,
      [me.workspaceId, team.id, number, identifier, b.title, b.description, b.status, b.priority, me.employeeId, b.assigneeId ?? null, b.labels, b.dueDate ?? null],
    )
    const id = rows[0]!.id
    if (b.assigneeId) await notifyAssignee(db, req, b.assigneeId, { id, identifier, title: b.title })
    await audit(req, 'ticket.created', 'ticket', id, { identifier, team: team.key, priority: b.priority }, db)
    return toTicket(await loadTicket(db, me, id))
  })
  res.status(201).json(ticket)
})

// ── Update ──────────────────────────────────────────────────────────
const patchSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(10_000),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    assigneeId: z.string().min(1).nullable(),
    labels,
    dueDate: z.string().regex(isoDate).nullable(),
    teamId: z.string().min(1),
  })
  .partial()
  .strict()

ticketsRouter.patch('/tickets/:id', async (req, res) => {
  const me = auth(req)
  const b = parse(patchSchema, req.body)
  if (!Object.keys(b).length) throw badRequest('Nothing to update')

  const ticket = await tx(async (db) => {
    const cur = await loadTicket(db, me, req.params.id, true)
    const involved = cur.reporter_id === me.employeeId || cur.assignee_id === me.employeeId
    // Anyone may pick up an unassigned ticket for themselves (Linear's "assign to me").
    const selfAssignOnly = Object.keys(b).length === 1 && b.assigneeId === me.employeeId && !cur.assignee_id
    if (!involved && !isLeader(me.role) && !selfAssignOnly) throw forbidden('Only the reporter, the assignee, managers and HR can edit this ticket')

    if (b.assigneeId) await assertEmployee(db, me.workspaceId, b.assigneeId)

    const patch: Record<string, unknown> = { ...b }
    let identifier = cur.identifier as string
    if (b.teamId && b.teamId !== cur.team_id) {
      const { team, number } = await lockTeam(db, me.workspaceId, b.teamId)
      identifier = `${team.key}-${number}`
      Object.assign(patch, { number, identifier })
    } else delete patch.teamId
    if (b.status && b.status !== cur.status) patch.completedAt = b.status === 'Done' ? new Date() : null

    const set = buildUpdate(patch, ['title', 'description', 'status', 'priority', 'assignee_id', 'labels', 'due_date', 'team_id', 'number', 'identifier', 'completed_at'], 3)
    if (set) {
      await db.query(
        `UPDATE tickets SET ${set.sql}, updated_at = now() WHERE id = $1 AND workspace_id = $2`,
        [cur.id, me.workspaceId, ...set.params],
      )
    }

    if (b.status && b.status !== cur.status) {
      await audit(req, 'ticket.status_changed', 'ticket', cur.id, { identifier, from: cur.status, to: b.status }, db)
    }
    if (b.teamId && b.teamId !== cur.team_id) {
      await audit(req, 'ticket.moved', 'ticket', cur.id, { from: cur.identifier, to: identifier }, db)
    }
    if (b.assigneeId && b.assigneeId !== cur.assignee_id) {
      await notifyAssignee(db, req, b.assigneeId, { id: cur.id, identifier, title: b.title ?? cur.title })
      await audit(req, 'ticket.assigned', 'ticket', cur.id, { identifier, assigneeId: b.assigneeId }, db)
    }
    return toTicket(await loadTicket(db, me, cur.id))
  })
  res.json(ticket)
})

// ── Comments ────────────────────────────────────────────────────────
ticketsRouter.post('/tickets/:id/comments', async (req, res) => {
  const me = auth(req)
  const { body } = parse(z.object({ body: z.string().trim().min(1, 'Write a comment first').max(5000) }), req.body)
  const comment = await tx(async (db) => {
    const cur = await loadTicket(db, me, req.params.id)
    const { rows } = await db.query(
      'INSERT INTO ticket_comments (workspace_id, ticket_id, author_id, body) VALUES ($1, $2, $3, $4) RETURNING id, author_id, body, created_at',
      [me.workspaceId, cur.id, me.employeeId, body],
    )
    await db.query('UPDATE tickets SET updated_at = now() WHERE id = $1', [cur.id])
    // Let the other people on the ticket know (one statement, no fan-out).
    await db.query(
      `INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href)
       SELECT $1, r.id, 'system', $2, left($3, 180), $4
         FROM (SELECT DISTINCT unnest(ARRAY[$5::text, $6::text]) AS id) r
        WHERE r.id IS NOT NULL AND r.id <> $7`,
      [me.workspaceId, `New comment on ${cur.identifier}`, body, `/app/tickets?id=${encodeURIComponent(cur.id)}`, cur.reporter_id, cur.assignee_id, me.employeeId],
    )
    return rows[0]!
  })
  res.status(201).json({ id: comment.id, authorId: comment.author_id, body: comment.body, createdAt: new Date(comment.created_at).toISOString() })
})
