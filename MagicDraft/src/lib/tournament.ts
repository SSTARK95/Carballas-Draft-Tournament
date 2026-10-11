export type MatchResult = 'player1' | 'player2' | 'draw';
export type PlayerState = 'active' | 'retired';

export interface Player {
  id: string;
  name: string;
  retired: boolean;
}

export interface Match {
  id: string;
  round: number;
  table: number;
  player1Id: string;
  player2Id: string;
  result: MatchResult | null;
}

export interface RoundRecord {
  id: string;
  round: number;
  matches: Match[];
  status: 'pending' | 'closed';
  createdAt: string;
}

export type PlayoffRound = 'semifinal-1' | 'semifinal-2' | 'final' | 'tercer-puesto';

export interface PlayoffMatch {
  id: string;
  round: PlayoffRound;
  label: string;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  player1Wins: number;
  player2Wins: number;
  bestOf: 3;
  status: 'pending' | 'closed';
}

export interface Tournament {
  id: string;
  name: string;
  players: Player[];
  totalRounds: number;
  currentRound: number;
  seed: string;
  rounds: RoundRecord[];
  playoffMatches: PlayoffMatch[];
  roundDurationMinutes: number;
  roundTimerStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
  debugMode: boolean;
}

export interface Standing {
  playerId: string;
  playerName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  record: string;
  buchholz: number;
  omw: number;
  winPercentage: number;
  rivals: number;
  retired: boolean;
  position: number;
}

export interface Pair {
  player1Id: string;
  player2Id: string;
}

export interface ScheduleValidationResult {
  valid: boolean;
  reason?: string;
}

const PLAYER_COUNT = 8;

function makePairKey(playerA: string, playerB: string): string {
  return [playerA, playerB].sort().join('|');
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const array = [...items];
  let next = stableHash(seed) + 1;
  for (let index = array.length - 1; index > 0; index -= 1) {
    next = (next * 1664525 + 1013904223) >>> 0;
    const randomIndex = next % (index + 1);
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }
  return array;
}

function allPairsInGraph(players: Player[]): Pair[] {
  const pairs: Pair[] = [];
  for (let left = 0; left < players.length; left += 1) {
    for (let right = left + 1; right < players.length; right += 1) {
      pairs.push({
        player1Id: players[left].id,
        player2Id: players[right].id
      });
    }
  }
  return pairs;
}

function getPlayedPairsSet(tournament: Tournament): Set<string> {
  const pairs = new Set<string>();
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.result === null) {
        continue;
      }
      pairs.add(makePairKey(match.player1Id, match.player2Id));
    }
  }
  return pairs;
}

function findAllPerfectMatchings(players: Player[], forbiddenPairs: Set<string>): Pair[][] {
  const list = [...players];

  if (list.length === 0) {
    return [[]];
  }

  if (list.length % 2 !== 0) {
    return [];
  }

  const first = list[0];
  const rest = list.slice(1);
  const results: Pair[][] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const second = rest[index];
    const key = makePairKey(first.id, second.id);
    if (forbiddenPairs.has(key)) {
      continue;
    }
    const remaining = rest.filter((player) => player.id !== second.id);
    const subMatches = findAllPerfectMatchings(remaining, forbiddenPairs);
    for (const subMatch of subMatches) {
      results.push([{ player1Id: first.id, player2Id: second.id }, ...subMatch]);
    }
  }

  return results;
}

export function validateRemainingScheduleFeasibility(
  usedPairs: Pair[],
  players: Player[],
  roundsRemaining: number
): ScheduleValidationResult {
  const activePlayers = players.filter((player) => !player.retired);
  if (activePlayers.length === 0) {
    return { valid: true };
  }

  if (activePlayers.length % 2 !== 0) {
    return { valid: false, reason: 'El número de jugadores activos debe ser par.' };
  }

  if (roundsRemaining < 0) {
    return { valid: false, reason: 'El número de rondas restantes no puede ser negativo.' };
  }

  const usedSet = new Set<string>();
  for (const pair of usedPairs) {
    if (!pair || !pair.player1Id || !pair.player2Id) {
      return { valid: false, reason: 'Hay emparejamientos incompletos en el calendario parcial.' };
    }

    const player1Id = pair.player1Id.trim();
    const player2Id = pair.player2Id.trim();
    if (!player1Id || !player2Id || player1Id === player2Id) {
      return { valid: false, reason: 'Los emparejamientos deben referenciar dos jugadores distintos.' };
    }

    const firstActive = activePlayers.some((player) => player.id === player1Id);
    const secondActive = activePlayers.some((player) => player.id === player2Id);
    if (!firstActive || !secondActive) {
      return { valid: false, reason: 'Los emparejamientos usados deben pertenecer a jugadores activos.' };
    }

    usedSet.add(makePairKey(player1Id, player2Id));
  }

  function canDecompose(currentPlayers: Player[], forbidden: Set<string>, roundsLeft: number): boolean {
    if (currentPlayers.length === 0) {
      return true;
    }

    if (currentPlayers.length % 2 !== 0) {
      return false;
    }

    const remainingEdges = allPairsInGraph(currentPlayers).filter(
      (pair) => !forbidden.has(makePairKey(pair.player1Id, pair.player2Id))
    );

    if (roundsLeft === 0) {
      return remainingEdges.length === 0;
    }

    if (remainingEdges.length === 0) {
      return false;
    }

    const options = findAllPerfectMatchings(currentPlayers, forbidden);
    if (options.length === 0) {
      return false;
    }

    for (const option of options) {
      const nextForbidden = new Set(forbidden);
      for (const match of option) {
        nextForbidden.add(makePairKey(match.player1Id, match.player2Id));
      }
      const matchedIds = new Set<string>();
      for (const match of option) {
        matchedIds.add(match.player1Id);
        matchedIds.add(match.player2Id);
      }
      const nextPlayers = currentPlayers.filter((player) => !matchedIds.has(player.id));
      if (canDecompose(nextPlayers, nextForbidden, roundsLeft - 1)) {
        return true;
      }
    }

    return false;
  }

  const valid = canDecompose(activePlayers, usedSet, roundsRemaining);
  if (!valid) {
    return {
      valid: false,
      reason: 'No hay una continuación válida sin repetir emparejamientos para las rondas restantes.'
    };
  }

  return { valid: true };
}

export function createTournament(
  name: string,
  playerNames: string[],
  seed = createSeed(),
  totalRounds = 7
): Tournament {
  if (playerNames.length !== PLAYER_COUNT) {
    throw new Error('El torneo debe tener exactamente 8 jugadores.');
  }

  const normalized = playerNames.map((value, index) => ({
    id: `player-${index + 1}`,
    name: value.trim(),
    retired: false
  }));

  if (normalized.some((player) => !player.name)) {
    throw new Error('Todos los jugadores deben tener un nombre válido.');
  }

  const duplicateNames = new Set<string>();
  for (const player of normalized) {
    const normalizedName = player.name.toLocaleLowerCase();
    if (duplicateNames.has(normalizedName)) {
      throw new Error(`No pueden existir nombres duplicados en un torneo: "${player.name}".`);
    }
    duplicateNames.add(normalizedName);
  }

  const now = new Date().toISOString();
  return {
    id: `tournament-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Nuevo torneo',
    players: normalized,
    totalRounds,
    currentRound: 1,
    seed,
    rounds: [],
    playoffMatches: [],
    roundDurationMinutes: 30,
    roundTimerStartedAt: null,
    createdAt: now,
    updatedAt: now,
    debugMode: false
  };
}

export function startRoundTimer(tournament: Tournament, minutes = tournament.roundDurationMinutes): Tournament {
  tournament.roundDurationMinutes = minutes;
  tournament.roundTimerStartedAt = new Date().toISOString();
  tournament.updatedAt = new Date().toISOString();
  return tournament;
}

export function generateRoundOne(tournament: Tournament): Tournament {
  const activePlayers = tournament.players.filter((player) => !player.retired);
  if (activePlayers.length !== PLAYER_COUNT) {
    throw new Error('El torneo debe tener exactamente 8 jugadores activos para generar la ronda 1.');
  }

  const shuffled = shuffleWithSeed(activePlayers, `${tournament.seed}-round-1`);
  const matches: Match[] = [];

  for (let table = 0; table < shuffled.length / 2; table += 1) {
    const player1 = shuffled[table * 2];
    const player2 = shuffled[table * 2 + 1];
    matches.push({
      id: `round-1-table-${table + 1}`,
      round: 1,
      table: table + 1,
      player1Id: player1.id,
      player2Id: player2.id,
      result: null
    });
  }

  tournament.rounds = [
    {
      id: `round-1-${Date.now()}`,
      round: 1,
      matches,
      status: 'pending',
      createdAt: new Date().toISOString()
    }
  ];
  tournament.currentRound = 1;
  tournament.roundTimerStartedAt = new Date().toISOString();
  tournament.updatedAt = new Date().toISOString();
  return tournament;
}

function scoreCandidate(
  candidate: Pair[],
  standings: Standing[],
  tournament: Tournament,
  roundNumber: number
): { score: number; buchholz: number; omw: number; seedValue: number } {
  let score = 0;
  let buchholz = 0;
  let omw = 0;

  for (const pair of candidate) {
    const first = standings.find((entry) => entry.playerId === pair.player1Id);
    const second = standings.find((entry) => entry.playerId === pair.player2Id);
    if (!first || !second) {
      continue;
    }
    score += Math.abs(first.matchPoints - second.matchPoints);
    buchholz += Math.abs(first.buchholz - second.buchholz);
    omw += Math.abs(first.omw - second.omw);
  }

  const seedValue = stableHash(
    `${tournament.seed}-round-${roundNumber}-${candidate.map((pair) => `${pair.player1Id}-${pair.player2Id}`).join('|')}`
  );

  return { score, buchholz, omw, seedValue };
}

export function generateNextRound(tournament: Tournament): Tournament {
  if (tournament.players.some((player) => player.retired)) {
    throw new Error('Si un jugador está retirado, la generación automática de rondas queda bloqueada.');
  }

  const currentRound = tournament.rounds.find((entry) => entry.round === tournament.currentRound);
  if (!currentRound) {
    throw new Error('No existe la ronda actual.');
  }

  if (currentRound.matches.some((match) => match.result === null)) {
    throw new Error('No se puede generar la siguiente ronda si faltan resultados.');
  }

  if (tournament.currentRound >= tournament.totalRounds) {
    throw new Error('La última ronda ya está cerrada.');
  }

  const nextRoundNumber = tournament.currentRound + 1;
  const activePlayers = tournament.players.filter((player) => !player.retired);
  const playedPairs = new Set<string>();
  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (match.result !== null) {
        playedPairs.add(makePairKey(match.player1Id, match.player2Id));
      }
    }
  }

  const candidateMatchings: Pair[][] = findAllPerfectMatchings(activePlayers, playedPairs);
  if (candidateMatchings.length === 0) {
    throw new Error('No hay una continuación válida sin repetir emparejamientos.');
  }

  const standings = getStandings(tournament);
  const scored = candidateMatchings
    .map((matching) => ({
      matching,
      ...scoreCandidate(matching, standings, tournament, nextRoundNumber)
    }))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      if (left.buchholz !== right.buchholz) return left.buchholz - right.buchholz;
      if (left.omw !== right.omw) return left.omw - right.omw;
      return left.seedValue - right.seedValue;
    });

  const chosen = scored.find(({ matching }) => {
    const usedAfterChoice = new Set(playedPairs);
    for (const match of matching) {
      usedAfterChoice.add(makePairKey(match.player1Id, match.player2Id));
    }
    const validation = validateRemainingScheduleFeasibility(
      Array.from(usedAfterChoice).map((pair) => {
        const [player1Id, player2Id] = pair.split('|');
        return { player1Id, player2Id };
      }),
      activePlayers,
      tournament.totalRounds - nextRoundNumber
    );
    return validation.valid;
  });

  if (!chosen) {
    throw new Error('No se puede generar la siguiente ronda porque el calendario restante ya no es viable.');
  }

  const roundRecord: RoundRecord = {
    id: `round-${nextRoundNumber}-${Date.now()}`,
    round: nextRoundNumber,
    matches: chosen.matching.map((match, index) => ({
      id: `round-${nextRoundNumber}-table-${index + 1}`,
      round: nextRoundNumber,
      table: index + 1,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      result: null
    })),
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  tournament.rounds.push(roundRecord);
  tournament.currentRound = nextRoundNumber;
  tournament.roundTimerStartedAt = new Date().toISOString();
  tournament.updatedAt = new Date().toISOString();
  return tournament;
}

export function setResultForMatch(tournament: Tournament, matchId: string, result: MatchResult): Tournament {
  for (const round of tournament.rounds) {
    const match = round.matches.find((entry) => entry.id === matchId);
    if (!match) {
      continue;
    }
    match.result = result;
    round.status = round.matches.every((entry) => entry.result !== null) ? 'closed' : 'pending';
    tournament.updatedAt = new Date().toISOString();
    return tournament;
  }

  throw new Error('No se encontró la mesa seleccionada.');
}

export function generateTopFourPlayoffBracket(tournament: Tournament): PlayoffMatch[] {
  const standings = getStandings(tournament).slice(0, 4);
  if (standings.length < 4) {
    return [];
  }

  const players = standings.map((standing) => ({
    id: standing.playerId,
    name: standing.playerName
  }));

  const semifinalOne: PlayoffMatch = {
    id: 'playoff-semifinal-1',
    round: 'semifinal-1',
    label: 'Semifinal 1',
    player1Id: players[0].id,
    player2Id: players[3].id,
    winnerId: null,
    player1Wins: 0,
    player2Wins: 0,
    bestOf: 3,
    status: 'pending'
  };

  const semifinalTwo: PlayoffMatch = {
    id: 'playoff-semifinal-2',
    round: 'semifinal-2',
    label: 'Semifinal 2',
    player1Id: players[1].id,
    player2Id: players[2].id,
    winnerId: null,
    player1Wins: 0,
    player2Wins: 0,
    bestOf: 3,
    status: 'pending'
  };

  tournament.playoffMatches = [semifinalOne, semifinalTwo];
  tournament.updatedAt = new Date().toISOString();
  return tournament.playoffMatches;
}

export function setPlayoffMatchWinner(tournament: Tournament, matchId: string, winnerId: string): Tournament {
  const match = tournament.playoffMatches.find((entry) => entry.id === matchId);
  if (!match) {
    throw new Error('No se encontró la eliminatoria seleccionada.');
  }

  if (!match.player1Id || !match.player2Id) {
    throw new Error('La eliminatoria no tiene jugadores definidos.');
  }

  if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
    throw new Error('El ganador debe pertenecer a uno de los dos jugadores de la mesa.');
  }

  match.winnerId = winnerId;
  match.status = 'closed';

  if (match.round === 'semifinal-1' || match.round === 'semifinal-2') {
    const semifinalWinner = match.winnerId;
    const semifinalLoser = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
    const finalMatch = tournament.playoffMatches.find((entry) => entry.round === 'final');
    const thirdPlaceMatch = tournament.playoffMatches.find((entry) => entry.round === 'tercer-puesto');

    if (!finalMatch) {
      tournament.playoffMatches.push({
        id: 'playoff-final',
        round: 'final',
        label: 'Final',
        player1Id: null,
        player2Id: null,
        winnerId: null,
        player1Wins: 0,
        player2Wins: 0,
        bestOf: 3,
        status: 'pending'
      });
    }

    if (!thirdPlaceMatch) {
      tournament.playoffMatches.push({
        id: 'playoff-tercer-puesto',
        round: 'tercer-puesto',
        label: 'Tercer puesto',
        player1Id: null,
        player2Id: null,
        winnerId: null,
        player1Wins: 0,
        player2Wins: 0,
        bestOf: 3,
        status: 'pending'
      });
    }

    const finalEntry = tournament.playoffMatches.find((entry) => entry.round === 'final');
    const thirdEntry = tournament.playoffMatches.find((entry) => entry.round === 'tercer-puesto');

    if (finalEntry) {
      const firstSemifinal = tournament.playoffMatches.find((entry) => entry.round === 'semifinal-1');
      const secondSemifinal = tournament.playoffMatches.find((entry) => entry.round === 'semifinal-2');
      const ready = firstSemifinal?.winnerId && secondSemifinal?.winnerId;
      if (ready) {
        finalEntry.player1Id = firstSemifinal.winnerId;
        finalEntry.player2Id = secondSemifinal.winnerId;
      }
    }

    if (thirdEntry) {
      const firstSemifinal = tournament.playoffMatches.find((entry) => entry.round === 'semifinal-1');
      const secondSemifinal = tournament.playoffMatches.find((entry) => entry.round === 'semifinal-2');
      const ready = firstSemifinal?.winnerId && secondSemifinal?.winnerId;
      if (ready) {
        thirdEntry.player1Id = firstSemifinal.winnerId === firstSemifinal.player1Id ? firstSemifinal.player2Id : firstSemifinal.player1Id;
        thirdEntry.player2Id = secondSemifinal.winnerId === secondSemifinal.player1Id ? secondSemifinal.player2Id : secondSemifinal.player1Id;
      }
    }
  }

  tournament.updatedAt = new Date().toISOString();
  return tournament;
}

export function closeCurrentRound(tournament: Tournament): Tournament {
  const currentRound = tournament.rounds.find((entry) => entry.round === tournament.currentRound);
  if (!currentRound) {
    throw new Error('No existe la ronda actual.');
  }

  if (currentRound.matches.some((match) => match.result === null)) {
    throw new Error('No se puede cerrar una ronda si existe alguna mesa pendiente.');
  }

  currentRound.status = 'closed';
  if (tournament.currentRound >= tournament.totalRounds) {
    if (!tournament.playoffMatches.length) {
      generateTopFourPlayoffBracket(tournament);
    }
    tournament.updatedAt = new Date().toISOString();
    return tournament;
  }

  return generateNextRound(tournament);
}

export function toggleRetirement(tournament: Tournament, playerId: string, retired: boolean): Tournament {
  const player = tournament.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error('Jugador no encontrado.');
  }
  player.retired = retired;
  tournament.updatedAt = new Date().toISOString();
  return tournament;
}

export function serializeTournament(tournament: Tournament): string {
  return JSON.stringify(tournament, null, 2);
}

export function deserializeTournament(raw: string): Tournament {
  const parsed = JSON.parse(raw) as Tournament;
  if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.rounds)) {
    throw new Error('El archivo JSON no contiene un torneo válido.');
  }
  return parsed;
}

export function getStandings(tournament: Tournament): Standing[] {
  const statsByPlayer = new Map<string, {
    wins: number;
    losses: number;
    draws: number;
    matchesPlayed: number;
    matchPoints: number;
    opponents: Set<string>;
  }>();

  for (const player of tournament.players) {
    statsByPlayer.set(player.id, {
      wins: 0,
      losses: 0,
      draws: 0,
      matchesPlayed: 0,
      matchPoints: 0,
      opponents: new Set<string>()
    });
  }

  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      const entryOne = statsByPlayer.get(match.player1Id);
      const entryTwo = statsByPlayer.get(match.player2Id);
      if (!entryOne || !entryTwo) {
        continue;
      }

      entryOne.opponents.add(match.player2Id);
      entryTwo.opponents.add(match.player1Id);

      entryOne.matchesPlayed += 1;
      entryTwo.matchesPlayed += 1;

      if (match.result === 'draw') {
        entryOne.draws += 1;
        entryTwo.draws += 1;
        entryOne.matchPoints += 1;
        entryTwo.matchPoints += 1;
        continue;
      }

      if (match.result === 'player1') {
        entryOne.wins += 1;
        entryTwo.losses += 1;
        entryOne.matchPoints += 3;
      } else {
        entryTwo.wins += 1;
        entryOne.losses += 1;
        entryTwo.matchPoints += 3;
      }
    }
  }

  const standings = tournament.players.map((player) => {
    const stats = statsByPlayer.get(player.id)!;
    const opponentIds = Array.from(stats.opponents);
    const opponentScores = opponentIds.map((opponentId) => {
      const opponentStats = statsByPlayer.get(opponentId);
      if (!opponentStats || opponentStats.matchesPlayed === 0) {
        return 0;
      }
      return opponentStats.matchPoints / (3 * opponentStats.matchesPlayed);
    });

    const omw = opponentScores.length === 0 ? 0 : opponentScores.reduce((sum, value) => sum + value, 0) / opponentScores.length;
    const matchWinPercentage = stats.matchesPlayed === 0 ? 0 : stats.matchPoints / (3 * stats.matchesPlayed);
    const record = stats.draws > 0 ? `${stats.wins}-${stats.losses}-${stats.draws}` : `${stats.wins}-${stats.losses}`;

    const buchholz = opponentIds.reduce((sum, opponentId) => {
      const opponentStats = statsByPlayer.get(opponentId);
      return sum + (opponentStats?.matchPoints ?? 0);
    }, 0);

    return {
      playerId: player.id,
      playerName: player.name,
      matchesPlayed: stats.matchesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      matchPoints: stats.matchPoints,
      record,
      buchholz,
      omw,
      winPercentage: matchWinPercentage,
      rivals: opponentIds.length,
      retired: player.retired,
      position: 0
    } satisfies Standing;
  });

  standings.sort((left, right) => {
    if (right.matchPoints !== left.matchPoints) return right.matchPoints - left.matchPoints;
    if (right.buchholz !== left.buchholz) return right.buchholz - left.buchholz;
    if (right.omw !== left.omw) return right.omw - left.omw;
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (left.retired !== right.retired) return Number(left.retired) - Number(right.retired);
    return left.playerName.localeCompare(right.playerName);
  });

  return standings.map((standing, index) => ({ ...standing, position: index + 1 }));
}

export function tournamentToCsv(tournament: Tournament): string {
  const standings = getStandings(tournament);
  const header = ['Posición', 'Jugador', 'Récord', 'Puntos', 'Buchholz', 'OMW%', 'Victorias', 'Estado', 'Rivales'];
  const rows = standings.map((standing) => [
    standing.position,
    standing.playerName,
    standing.record,
    standing.matchPoints,
    standing.buchholz,
    `${(standing.omw * 100).toFixed(2)} %`,
    standing.wins,
    standing.retired ? 'Retirado' : 'Activo',
    standing.rivals
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function buildRoundRobinSchedule(players: Player[]): Match[] {
  const results: Match[] = [];
  const working = [...players];
  for (let index = 0; index < working.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < working.length; otherIndex += 1) {
      results.push({
        id: `${working[index].id}-${working[otherIndex].id}`,
        round: 0,
        table: 0,
        player1Id: working[index].id,
        player2Id: working[otherIndex].id,
        result: null
      });
    }
  }
  return results;
}

export function formatRecord(wins: number, losses: number, draws: number): string {
  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)} %`;
}

export function getTournamentAccuracySnapshot(tournament: Tournament): {
  playedPairs: Pair[];
  pendingPairs: Pair[];
  remainingRounds: number;
  feasible: boolean;
  reason?: string;
} {
  const playedPairsSet = getPlayedPairsSet(tournament);
  const activePlayers = tournament.players.filter((player) => !player.retired);
  const allPairs = allPairsInGraph(activePlayers);
  const pendingPairs = allPairs.filter((pair) => !playedPairsSet.has(makePairKey(pair.player1Id, pair.player2Id)));
  const usedPairs = Array.from(playedPairsSet).map((pair) => {
    const [player1Id, player2Id] = pair.split('|');
    return { player1Id, player2Id };
  });
  const remainingRounds = Math.max(1, tournament.totalRounds - tournament.currentRound + 1);
  const validation = validateRemainingScheduleFeasibility(
    usedPairs,
    activePlayers,
    Math.max(0, remainingRounds)
  );

  return {
    playedPairs: Array.from(playedPairsSet).map((pair) => {
      const [player1Id, player2Id] = pair.split('|');
      return { player1Id, player2Id };
    }),
    pendingPairs,
    remainingRounds: tournament.currentRound > tournament.totalRounds ? 0 : remainingRounds,
    feasible: validation.valid,
    reason: validation.reason
  };
}

export function canGenerateNextRound(tournament: Tournament): boolean {
  if (tournament.players.some((player) => player.retired)) {
    return false;
  }

  const currentRound = tournament.rounds.find((entry) => entry.round === tournament.currentRound);
  if (!currentRound) {
    return false;
  }

  return currentRound.matches.every((match) => match.result !== null);
}

export function getRoundSummary(round: RoundRecord): string {
  return round.matches.map((match) => `${match.table}: ${match.result ?? 'Pendiente'}`).join(' • ');
}
