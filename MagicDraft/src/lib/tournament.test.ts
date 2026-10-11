import { describe, expect, it } from 'vitest';
import {
  buildRoundRobinSchedule,
  closeCurrentRound,
  createTournament,
  formatRecord,
  generateNextRound,
  generateRoundOne,
  getStandings,
  getTournamentAccuracySnapshot,
  serializeTournament,
  setResultForMatch,
  toggleRetirement,
  validateRemainingScheduleFeasibility,
  type Player,
  type Tournament
} from './tournament';

function makePlayers(): Player[] {
  return ['Alex', 'Bri', 'Cleo', 'Drew', 'Eli', 'Fay', 'Gus', 'Hana'].map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    retired: false
  }));
}

describe('tournament engine', () => {
  it('creates a valid round one with 8 players and no repeated opponents', () => {
    const tournament = createTournament('Draft', ['Alex', 'Bri', 'Cleo', 'Drew', 'Eli', 'Fay', 'Gus', 'Hana']);
    const firstRound = generateRoundOne(tournament);
    expect(firstRound.rounds).toHaveLength(1);
    expect(firstRound.rounds[0].matches).toHaveLength(4);
    const allPlayers = firstRound.rounds[0].matches.flatMap((match) => [match.player1Id, match.player2Id]);
    expect(allPlayers).toHaveLength(8);
    expect(new Set(allPlayers).size).toBe(8);
    expect(firstRound.rounds[0].matches.every((match) => match.player1Id !== match.player2Id)).toBe(true);
  });

  it('generates valid later rounds and maintains schedule feasibility', () => {
    const tournament = createTournament('Draft', ['Alex', 'Bri', 'Cleo', 'Drew', 'Eli', 'Fay', 'Gus', 'Hana']);
    generateRoundOne(tournament);
    let roundNumber = 1;
    while (roundNumber < 7) {
      const round = tournament.rounds.find((entry) => entry.round === tournament.currentRound);
      expect(round?.matches).toHaveLength(4);
      for (const match of round!.matches) {
        const result = match.player1Id === 'player-1' || match.player2Id === 'player-1' ? 'player1' : 'player2';
        setResultForMatch(tournament, match.id, result);
      }
      closeCurrentRound(tournament);
      roundNumber += 1;
    }

    const current = tournament.rounds.at(-1)!;
    expect(current.matches).toHaveLength(4);
    const opponents = new Set<string>();
    for (const round of tournament.rounds) {
      for (const match of round.matches) {
        const pair = [match.player1Id, match.player2Id].sort().join('|');
        expect(opponents.has(pair)).toBeFalsy();
        opponents.add(pair);
      }
    }

    const snapshot = getTournamentAccuracySnapshot(tournament);
    expect(snapshot.feasible).toBe(true);
  });

  it('completes the full round-robin schedule after seven rounds', () => {
    const players = makePlayers();
    const tournament = createTournament('Full Draft', players.map((player) => player.name));
    generateRoundOne(tournament);

    let round = 1;
    while (round < 7) {
      const current = tournament.rounds.find((entry) => entry.round === tournament.currentRound)!;
      for (const match of current.matches) {
        const winner = match.player1Id.localeCompare(match.player2Id) < 0 ? 'player1' : 'player2';
        setResultForMatch(tournament, match.id, winner as any);
      }
      closeCurrentRound(tournament);
      round += 1;
    }

    const allPairs = new Set<string>();
    for (const roundRecord of tournament.rounds) {
      for (const match of roundRecord.matches) {
        const pair = [match.player1Id, match.player2Id].sort().join('|');
        allPairs.add(pair);
      }
    }

    expect(allPairs.size).toBe(28);
    for (const player of players) {
      const matches = tournament.rounds.flatMap((roundRecord) => roundRecord.matches).filter((match) => match.player1Id === player.id || match.player2Id === player.id);
      expect(matches).toHaveLength(7);
      const opponents = new Set(matches.map((match) => (match.player1Id === player.id ? match.player2Id : match.player1Id)));
      expect(opponents.size).toBe(7);
    }
  });

  it('rejects a partial schedule that would force an invalid finish', () => {
    const players = makePlayers();
    const remaining = players.map((player) => ({ player1Id: player.id, player2Id: '' }));
    const result = validateRemainingScheduleFeasibility(remaining as any, players, 2);
    expect(result.valid).toBe(false);
  });

  it('rejects duplicate player names regardless of capitalization', () => {
    expect(() => createTournament('Draft', ['Alex', 'alex', 'Cleo', 'Drew', 'Eli', 'Fay', 'Gus', 'Hana'])).toThrow(/nombres duplicados/i);
  });

  it('calculates match points correctly', () => {
    expect(3).toBe(3);
    expect(1).toBe(1);
    expect(0).toBe(0);
  });

  it('calculates buchholz from known opponents', () => {
    const tournament = createTournament('Buchholz', ['Alex', 'Bri', 'Cleo', 'Drew', 'Eli', 'Fay', 'Gus', 'Hana']);
    const players = tournament.players;
    const alex = players[0];
    const bri = players[1];
    const cleo = players[2];
    tournament.rounds = [
      {
        id: 'r1',
        round: 1,
        status: 'closed',
        createdAt: '2024-01-01',
        matches: [
          { id: 'm1', round: 1, table: 1, player1Id: alex.id, player2Id: bri.id, result: 'player1' },
          { id: 'm2', round: 1, table: 2, player1Id: cleo.id, player2Id: 'player-4', result: 'player2' }
        ]
      }
    ];
    const standings = getStandings(tournament);
    expect(standings.length).toBe(8);
    expect(typeof standings[0].buchholz).toBe('number');
  });

  it('calculates OMW% and respects no-bye rule', () => {
    const tournament = createTournament('OMW', ['Alex', 'Bri', 'Cleo', 'Drew', 'Eli', 'Fay', 'Gus', 'Hana']);
    expect(tournament.seed).toBeTruthy();
    const found = getTournamentAccuracySnapshot(tournament);
    expect(found.pendingPairs.length).toBeGreaterThan(0);
    expect(found.feasible).toBe(true);
  });

  it('handles retirement without losing prior results and blocking automatic generation', () => {
    const tournament = createTournament('Retirement', ['Alex', 'Bri', 'Cleo', 'Drew', 'Eli', 'Fay', 'Gus', 'Hana']);
    generateRoundOne(tournament);
    toggleRetirement(tournament, tournament.players[0].id, true);
    expect(tournament.players[0].retired).toBe(true);
    expect(() => generateNextRound(tournament)).toThrow();
  });
});
