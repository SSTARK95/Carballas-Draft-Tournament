import Dexie, { type Table } from 'dexie';
import type { Tournament } from '$lib/tournament';

export interface TournamentRecord {
  id: string;
  payload: string;
  updatedAt: string;
}

class TournamentDatabase extends Dexie {
  tournaments!: Table<TournamentRecord, string>;

  constructor() {
    super('magic-draft-db');
    this.version(1).stores({
      tournaments: '&id, updatedAt'
    });
  }
}

export const db = new TournamentDatabase();

export async function listTournamentRecords(): Promise<TournamentRecord[]> {
  return db.tournaments.orderBy('updatedAt').reverse().toArray();
}

export async function saveTournamentRecord(tournament: Tournament): Promise<void> {
  await db.tournaments.put({
    id: tournament.id,
    payload: JSON.stringify(tournament),
    updatedAt: tournament.updatedAt
  });
}

export async function deleteTournamentRecord(id: string): Promise<void> {
  await db.tournaments.delete(id);
}
