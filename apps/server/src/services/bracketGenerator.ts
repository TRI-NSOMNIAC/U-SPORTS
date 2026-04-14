import { v4 as uuid } from 'uuid'
import supabase from '../utils/supabase'

type BracketFormat = 'single_elim' | 'double_elim' | 'round_robin'

interface Participant {
  id: string
  seed?: number
}

interface BracketNode {
  id: string
  event_id: string
  round: number
  match_order: number
  participant_a_id: string | null
  participant_b_id: string | null
  winner_id: string | null
  next_bracket_id: string | null
  is_bye: boolean
  bracket_type: string
}

interface MatchStub {
  id: string
  event_id: string
  bracket_id: string | null
  participant_a_id: string | null
  participant_b_id: string | null
  status: string
}

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

function seedParticipants(participants: Participant[]): Participant[] {
  // Sort by seed if provided, otherwise keep order
  return [...participants].sort((a, b) => {
    if (a.seed !== undefined && b.seed !== undefined) return a.seed - b.seed
    if (a.seed !== undefined) return -1
    if (b.seed !== undefined) return 1
    return 0
  })
}

// Single Elimination bracket
function buildSingleElim(
  eventId: string,
  participants: Participant[]
): { brackets: BracketNode[]; matches: MatchStub[] } {
  const seeded = seedParticipants(participants)
  const size = nextPowerOfTwo(seeded.length)
  const totalRounds = Math.log2(size)
  const brackets: BracketNode[] = []
  const matches: MatchStub[] = []

  // Build from final round backwards
  // Round 1 = first round, round totalRounds = final
  const roundBrackets: BracketNode[][] = []

  // Create all bracket slots
  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = size / Math.pow(2, round)
    const roundSlots: BracketNode[] = []
    for (let order = 0; order < matchesInRound; order++) {
      const node: BracketNode = {
        id: uuid(),
        event_id: eventId,
        round,
        match_order: order,
        participant_a_id: null,
        participant_b_id: null,
        winner_id: null,
        next_bracket_id: null,
        is_bye: false,
        bracket_type: 'winners',
      }
      roundSlots.push(node)
    }
    roundBrackets.push(roundSlots)
  }

  // Link next_bracket_id: each match feeds into parent round
  for (let r = 0; r < roundBrackets.length - 1; r++) {
    for (let i = 0; i < roundBrackets[r].length; i++) {
      const parentIndex = Math.floor(i / 2)
      roundBrackets[r][i].next_bracket_id = roundBrackets[r + 1][parentIndex].id
    }
  }

  // Seed first round (round index 0)
  // Standard seeding: 1 vs last, 2 vs second-last, etc.
  const firstRound = roundBrackets[0]
  const byeCount = size - seeded.length

  // Place top seeds, rest get byes
  for (let i = 0; i < firstRound.length; i++) {
    const aIdx = i * 2
    const bIdx = i * 2 + 1
    const participantA = seeded[aIdx] ?? null
    const participantB = seeded[bIdx] ?? null

    firstRound[i].participant_a_id = participantA?.id ?? null
    firstRound[i].participant_b_id = participantB?.id ?? null

    if (!participantB && participantA) {
      // Bye: participant A advances automatically
      firstRound[i].is_bye = true
      firstRound[i].winner_id = participantA.id
      // Auto-advance to next round
      if (firstRound[i].next_bracket_id) {
        const nextRound = roundBrackets[1]
        const parentIdx = Math.floor(i / 2)
        if (i % 2 === 0) {
          nextRound[parentIdx].participant_a_id = participantA.id
        } else {
          nextRound[parentIdx].participant_b_id = participantA.id
        }
      }
    }
  }

  // Flatten and create matches for non-bye brackets
  for (const roundSlots of roundBrackets) {
    for (const bracket of roundSlots) {
      brackets.push(bracket)
      if (!bracket.is_bye) {
        const match: MatchStub = {
          id: uuid(),
          event_id: eventId,
          bracket_id: bracket.id,
          participant_a_id: bracket.participant_a_id,
          participant_b_id: bracket.participant_b_id,
          status: 'scheduled',
        }
        matches.push(match)
      }
    }
  }

  return { brackets, matches }
}

// Round Robin: every participant plays every other
function buildRoundRobin(
  eventId: string,
  participants: Participant[]
): { brackets: BracketNode[]; matches: MatchStub[] } {
  const brackets: BracketNode[] = []
  const matches: MatchStub[] = []
  let matchOrder = 0

  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const bracket: BracketNode = {
        id: uuid(),
        event_id: eventId,
        round: 1,
        match_order: matchOrder++,
        participant_a_id: participants[i].id,
        participant_b_id: participants[j].id,
        winner_id: null,
        next_bracket_id: null,
        is_bye: false,
        bracket_type: 'round_robin',
      }
      brackets.push(bracket)
      matches.push({
        id: uuid(),
        event_id: eventId,
        bracket_id: bracket.id,
        participant_a_id: participants[i].id,
        participant_b_id: participants[j].id,
        status: 'scheduled',
      })
    }
  }

  return { brackets, matches }
}

// Double Elimination (simplified: winners + losers brackets)
function buildDoubleElim(
  eventId: string,
  participants: Participant[]
): { brackets: BracketNode[]; matches: MatchStub[] } {
  // Build winners bracket first
  const { brackets: winnersBrackets, matches: winnersMatches } = buildSingleElim(eventId, participants)

  // Mark winners bracket type
  winnersBrackets.forEach((b) => (b.bracket_type = 'winners'))

  // Create losers bracket slots (simplified: same structure as winners but half size)
  const losersBrackets: BracketNode[] = []
  const losersMatches: MatchStub[] = []

  const seeded = seedParticipants(participants)
  const size = nextPowerOfTwo(seeded.length)
  const loserRounds = Math.log2(size) - 1

  for (let round = 1; round <= loserRounds; round++) {
    const matchesInRound = Math.max(1, size / Math.pow(2, round + 1))
    for (let order = 0; order < matchesInRound; order++) {
      const bracket: BracketNode = {
        id: uuid(),
        event_id: eventId,
        round: round + 100,
        match_order: order,
        participant_a_id: null,
        participant_b_id: null,
        winner_id: null,
        next_bracket_id: null,
        is_bye: false,
        bracket_type: 'losers',
      }
      losersBrackets.push(bracket)
      losersMatches.push({
        id: uuid(),
        event_id: eventId,
        bracket_id: bracket.id,
        participant_a_id: null,
        participant_b_id: null,
        status: 'scheduled',
      })
    }
  }

  // Grand Final
  const grandFinal: BracketNode = {
    id: uuid(),
    event_id: eventId,
    round: 999,
    match_order: 0,
    participant_a_id: null,
    participant_b_id: null,
    winner_id: null,
    next_bracket_id: null,
    is_bye: false,
    bracket_type: 'grand_final',
  }
  const grandFinalMatch: MatchStub = {
    id: uuid(),
    event_id: eventId,
    bracket_id: grandFinal.id,
    participant_a_id: null,
    participant_b_id: null,
    status: 'scheduled',
  }

  return {
    brackets: [...winnersBrackets, ...losersBrackets, grandFinal],
    matches: [...winnersMatches, ...losersMatches, grandFinalMatch],
  }
}

export async function generateBracket(
  eventId: string,
  participantIds: string[],
  format: BracketFormat,
  seeds?: Record<string, number>
): Promise<{ success: boolean; bracketCount: number; matchCount: number }> {
  const participants: Participant[] = participantIds.map((id) => ({
    id,
    seed: seeds?.[id],
  }))

  if (participants.length < 2) {
    throw new Error('At least 2 participants required to generate a bracket')
  }

  let brackets: BracketNode[]
  let matches: MatchStub[]

  switch (format) {
    case 'single_elim':
      ;({ brackets, matches } = buildSingleElim(eventId, participants))
      break
    case 'double_elim':
      ;({ brackets, matches } = buildDoubleElim(eventId, participants))
      break
    case 'round_robin':
      ;({ brackets, matches } = buildRoundRobin(eventId, participants))
      break
    default:
      throw new Error(`Unknown format: ${format}`)
  }

  // Clear existing brackets and matches for this event
  await supabase.from('matches').delete().eq('event_id', eventId)
  await supabase.from('brackets').delete().eq('event_id', eventId)

  // Insert brackets first (matches reference bracket ids)
  const { error: bracketError } = await supabase.from('brackets').insert(brackets)
  if (bracketError) throw new Error(`Failed to insert brackets: ${bracketError.message}`)

  const { error: matchError } = await supabase.from('matches').insert(matches)
  if (matchError) throw new Error(`Failed to insert matches: ${matchError.message}`)

  // Update event status
  await supabase.from('events').update({ status: 'in_progress' }).eq('id', eventId)

  return { success: true, bracketCount: brackets.length, matchCount: matches.length }
}

// Called after a match completes - advances winner in bracket
export async function advanceWinner(matchId: string, winnerId: string): Promise<void> {
  // Get bracket for this match
  const { data: match } = await supabase
    .from('matches')
    .select('bracket_id, event_id')
    .eq('id', matchId)
    .single()

  if (!match?.bracket_id) return

  // Update bracket winner
  await supabase.from('brackets').update({ winner_id: winnerId }).eq('id', match.bracket_id)

  // Get next bracket
  const { data: bracket } = await supabase
    .from('brackets')
    .select('next_bracket_id, match_order, round')
    .eq('id', match.bracket_id)
    .single()

  if (!bracket?.next_bracket_id) {
    // This was the final - mark event as completed
    await supabase.from('events').update({ status: 'completed' }).eq('id', match.event_id)
    return
  }

  // Determine if winner goes to slot A or B in next bracket
  const { data: nextBracket } = await supabase
    .from('brackets')
    .select('*')
    .eq('id', bracket.next_bracket_id)
    .single()

  if (!nextBracket) return

  const field = bracket.match_order % 2 === 0 ? 'participant_a_id' : 'participant_b_id'
  await supabase
    .from('brackets')
    .update({ [field]: winnerId })
    .eq('id', bracket.next_bracket_id)

  // Update the corresponding match
  await supabase
    .from('matches')
    .update({ [field]: winnerId })
    .eq('bracket_id', bracket.next_bracket_id)
}
