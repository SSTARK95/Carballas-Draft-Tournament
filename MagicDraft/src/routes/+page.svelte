<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { db, listTournamentRecords, saveTournamentRecord, deleteTournamentRecord } from '$lib/db';
  import { createTournament, deserializeTournament, serializeTournament } from '$lib/tournament';
  type TournamentEntry = {
    id: string;
    name: string;
    currentRound: number;
    players: number;
    createdAt: string;
    payload: string;
  };

  let entries: TournamentEntry[] = [];
  let name = '';
  let roundMinutes = 30;
  let playerNames = Array.from({ length: 8 }, () => '');
  let error = '';
  let importText = '';

  async function loadEntries() {
    const records = await listTournamentRecords();
    entries = records.map((record) => {
      const tournament = JSON.parse(record.payload) as { name: string; currentRound: number; players: { length: number }; createdAt: string; id: string };
      return {
        id: tournament.id ?? record.id,
        name: tournament.name,
        currentRound: tournament.currentRound,
        players: tournament.players?.length ?? 8,
        createdAt: tournament.createdAt,
        payload: record.payload
      };
    });
  }

  onMount(async () => {
    await loadEntries();
  });

  function validateDistinctPlayerNames() {
    const normalized = playerNames.map((value) => value.trim());
    const seen = new Set<string>();
    for (const playerName of normalized) {
      const key = playerName.toLocaleLowerCase();
      if (!playerName) {
        continue;
      }
      if (seen.has(key)) {
        return `Los nombres de los jugadores deben ser distintos. El nombre "${playerName}" está repetido.`;
      }
      seen.add(key);
    }
    return '';
  }

  function createNewTournament() {
    error = '';
    try {
      const validationError = validateDistinctPlayerNames();
      if (validationError) {
        error = validationError;
        return;
      }

      const tournament = createTournament(name || 'Nuevo torneo', playerNames);
      tournament.roundDurationMinutes = Number(roundMinutes) || 30;
      const tournamentText = serializeTournament(tournament);
      saveTournamentRecord(tournament);
      const parsed = JSON.parse(tournamentText);
      localStorage.setItem('magic-draft-current', JSON.stringify(parsed));
      window.location.href = `${base}/torneo`;
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : 'Error al crear el torneo.';
    }
  }

  function handleImport() {
    try {
      const parsed = deserializeTournament(importText);
      saveTournamentRecord(parsed);
      localStorage.setItem('magic-draft-current', JSON.stringify(parsed));
      window.location.href = `${base}/torneo`;
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : 'JSON inválido.';
    }
  }

  async function removeTournament(id: string) {
    if (!confirm('¿Seguro que quieres eliminar este torneo?')) {
      return;
    }
    await deleteTournamentRecord(id);
    await loadEntries();
  }

  function openTournament(entry: TournamentEntry) {
    localStorage.setItem('magic-draft-current', entry.payload);
    window.location.href = `${base}/torneo`;
  }
</script>

<div class="min-h-screen bg-slate-950 p-4 pb-24 text-slate-100">
  <div class="mx-auto max-w-5xl space-y-6">
    <header class="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-cyan-400">Magic Draft</p>
          <h1 class="mt-2 text-3xl font-bold">Torneos</h1>
        </div>
        <button class="rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950" on:click={() => (document.getElementById('create-panel')?.scrollIntoView({ behavior: 'smooth' }))}>Crear torneo</button>
      </div>
    </header>

    <section id="create-panel" class="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
      <h2 class="mb-4 text-xl font-semibold">Crear torneo</h2>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="text-sm text-slate-300">Nombre del torneo</span>
          <input bind:value={name} class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3" placeholder="Draft local" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm text-slate-300">Duración de la ronda</span>
          <select bind:value={roundMinutes} class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100">
            <option value={10}>10 minutos</option>
            <option value={15}>15 minutos</option>
            <option value={20}>20 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={45}>45 minutos</option>
            <option value={60}>60 minutos</option>
          </select>
        </label>
      </div>

      <div class="mt-3 text-sm text-slate-400">
        <p class="mb-1">Formato</p>
        <p class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3">BO1 • 8 jugadores • 7 rondas</p>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {#each playerNames as player, index}
          <label class="flex flex-col gap-1">
            <span class="text-sm text-slate-300">Jugador {index + 1}</span>
            <input bind:value={playerNames[index]} class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3" placeholder={`Jugador ${index + 1}`} />
          </label>
        {/each}
      </div>

      {#if error}
        <div class="mt-4 rounded-xl border border-red-500 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      {/if}

      <div class="mt-5 flex flex-wrap gap-3">
        <button class="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950" on:click={createNewTournament}>Crear y generar ronda 1</button>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
      <h2 class="mb-4 text-xl font-semibold">Importar torneo</h2>
      <textarea bind:value={importText} class="min-h-[140px] w-full rounded-xl border border-slate-700 bg-slate-950 p-3" placeholder="Pega el JSON exportado del torneo..."></textarea>
      <div class="mt-3">
        <button class="rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950" on:click={handleImport}>Importar JSON</button>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
      <h2 class="mb-4 text-xl font-semibold">Mis torneos</h2>
      {#if entries.length === 0}
        <p class="text-slate-400">Todavía no hay torneos guardados.</p>
      {:else}
        <div class="space-y-3">
          {#each entries as entry}
            <div class="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-950 p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-lg font-semibold">{entry.name}</p>
                <p class="text-sm text-slate-400">Creado: {new Date(entry.createdAt).toLocaleString('es-ES')}</p>
                <p class="text-sm text-slate-400">Ronda actual: {entry.currentRound} • Jugadores: {entry.players}</p>
              </div>
              <div class="flex gap-2">
                <button class="rounded-lg bg-slate-700 px-3 py-2" on:click={() => openTournament(entry)}>Abrir</button>
                <button class="rounded-lg bg-red-500/80 px-3 py-2 text-white" on:click={() => removeTournament(entry.id)}>Eliminar</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
