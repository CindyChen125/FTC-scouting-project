import { supabase } from './config'
import { withTimeout } from './timeout'
import { StrategyDraft, StrategyRecord, normalizeStrategyDraft, validateStrategyDraft } from '../strategy/strategyRecord'
import { StrategyObjectOverride, StrategyObjectPatch, applyObjectOverrides } from '../strategy/collaboration'
import { normalizeTimeline } from '../strategy/timeline'

type StrategyRow = {
  id: string
  name: string
  event_code: string
  match_number: string
  red_team_numbers: string[]
  blue_team_numbers: string[]
  board: StrategyRecord['board']
  timeline: Record<string, unknown>
  source_strategy_id: string | null
  revision: number
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

type ObjectRow = {
  strategy_id: string
  object_key: string
  kind: StrategyObjectOverride['kind']
  phase: StrategyObjectOverride['phase']
  robot_id: string | null
  object_id: string
  value: Record<string, unknown> | null
  revision: number
}

export class StrategyConflictError extends Error {
  constructor() { super('This scenario changed since you loaded it. Reload it or save your work as a new scenario.'); this.name = 'StrategyConflictError' }
}

export class StrategyMissingError extends Error {
  constructor() { super('This scenario no longer exists or you cannot edit it.'); this.name = 'StrategyMissingError' }
}

const columns = 'id,name,event_code,match_number,red_team_numbers,blue_team_numbers,board,timeline,source_strategy_id,revision,created_at,updated_at,created_by,updated_by'

const toRecord = (row: StrategyRow): StrategyRecord => ({
  id: row.id, name: row.name, eventCode: row.event_code, matchNumber: row.match_number ?? '',
  redTeams: [row.red_team_numbers?.[0] ?? '', row.red_team_numbers?.[1] ?? ''],
  blueTeams: [row.blue_team_numbers?.[0] ?? '', row.blue_team_numbers?.[1] ?? ''],
  board: row.board, timeline: row.timeline ?? {}, sourceStrategyId: row.source_strategy_id,
  revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
  createdBy: row.created_by, updatedBy: row.updated_by, objectRevisions: {}
})
const toObject = (row: ObjectRow): StrategyObjectOverride => ({
  strategyId: row.strategy_id, key: row.object_key, kind: row.kind, phase: row.phase,
  robotId: row.robot_id, objectId: row.object_id, value: row.value, revision: row.revision
})
const hydrate = (record: StrategyRecord, overrides: StrategyObjectOverride[]): StrategyRecord => {
  const state = applyObjectOverrides({ board: record.board, timeline: normalizeTimeline(record.timeline) }, overrides)
  return { ...record, board: state.board, timeline: state.timeline,
    objectRevisions: Object.fromEntries(overrides.map((item) => [item.key, item.revision])) }
}

const toColumns = (input: StrategyDraft) => {
  const draft = normalizeStrategyDraft(input)
  const issue = validateStrategyDraft(draft)
  if (issue) throw new Error(issue)
  return {
    name: draft.name, event_code: draft.eventCode, match_number: draft.matchNumber,
    red_team_numbers: draft.redTeams, blue_team_numbers: draft.blueTeams,
    board: draft.board, timeline: draft.timeline
  }
}

export async function listStrategies(): Promise<StrategyRecord[]> {
  const { data, error } = await withTimeout(supabase.from('strategies').select(columns).order('updated_at', { ascending: false }))
  if (error) throw error
  const records = ((data ?? []) as StrategyRow[]).map(toRecord)
  if (!records.length) return records
  const { data: objects, error: objectError } = await withTimeout(supabase.from('strategy_objects')
    .select('strategy_id,object_key,kind,phase,robot_id,object_id,value,revision')
    .in('strategy_id', records.map((record) => record.id)))
  if (objectError) throw objectError
  const byStrategy = new Map<string, StrategyObjectOverride[]>()
  for (const row of (objects ?? []) as ObjectRow[]) {
    const item = toObject(row)
    byStrategy.set(item.strategyId, [...(byStrategy.get(item.strategyId) ?? []), item])
  }
  return records.map((record) => hydrate(record, byStrategy.get(record.id) ?? []))
}

export async function getStrategy(id: string): Promise<StrategyRecord> {
  const { data, error } = await withTimeout(supabase.from('strategies').select(columns).eq('id', id).maybeSingle())
  if (error) throw error
  if (!data) throw new StrategyMissingError()
  return hydrate(toRecord(data as StrategyRow), await listStrategyObjects(id))
}

export async function listStrategyObjects(strategyId: string): Promise<StrategyObjectOverride[]> {
  const { data, error } = await withTimeout(supabase.from('strategy_objects')
    .select('strategy_id,object_key,kind,phase,robot_id,object_id,value,revision')
    .eq('strategy_id', strategyId))
  if (error) throw error
  return ((data ?? []) as ObjectRow[]).map(toObject)
}

export async function applyStrategyObjectPatch(strategyId: string, patch: StrategyObjectPatch,
  expectedRevision: number): Promise<StrategyObjectOverride> {
  const { data, error } = await withTimeout(supabase.rpc('apply_strategy_object', {
    p_strategy_id: strategyId, p_kind: patch.kind, p_phase: patch.phase,
    p_robot_id: patch.robotId, p_object_id: patch.objectId,
    p_value: patch.value, p_expected_revision: expectedRevision
  }))
  if (error) throw error
  if (!data) throw new Error('Strategy object was not saved')
  return toObject(data as ObjectRow)
}

export async function createStrategy(input: StrategyDraft, sourceStrategyId: string | null = null): Promise<StrategyRecord> {
  const { data, error } = await withTimeout(supabase.from('strategies')
    .insert({ ...toColumns(input), source_strategy_id: sourceStrategyId }).select(columns).single())
  if (error) throw error
  return toRecord(data as StrategyRow)
}

export async function updateStrategy(record: StrategyRecord, input: StrategyDraft): Promise<StrategyRecord> {
  const { data, error } = await withTimeout(supabase.from('strategies')
    .update(toColumns(input)).eq('id', record.id).eq('revision', record.revision).select(columns).maybeSingle())
  if (error) throw error
  if (data) return hydrate(toRecord(data as StrategyRow), await listStrategyObjects(record.id))
  const { data: latest, error: lookupError } = await withTimeout(supabase.from('strategies')
    .select('id,revision').eq('id', record.id).maybeSingle())
  if (lookupError) throw lookupError
  if (latest && latest.revision !== record.revision) throw new StrategyConflictError()
  throw new StrategyMissingError()
}

export async function renameStrategy(record: StrategyRecord, name: string): Promise<StrategyRecord> {
  const draft: StrategyDraft = {
    name, eventCode: record.eventCode, matchNumber: record.matchNumber,
    redTeams: record.redTeams, blueTeams: record.blueTeams,
    board: record.board, timeline: record.timeline
  }
  return updateStrategy(record, draft)
}

export async function deleteStrategy(id: string): Promise<void> {
  const { data, error } = await withTimeout(supabase.from('strategies').delete().eq('id', id).select('id'))
  if (error) throw error
  if (!data?.length) throw new StrategyMissingError()
}
