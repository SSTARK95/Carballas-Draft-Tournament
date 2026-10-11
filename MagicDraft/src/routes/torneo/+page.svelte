<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { saveTournamentRecord } from '$lib/db';
  import {
    closeCurrentRound,
    generateNextRound,
    generateRoundOne,
    getStandings,
    getTournamentAccuracySnapshot,
    serializeTournament,
    setPlayoffMatchWinner,
    setResultForMatch,
    startRoundTimer,
    toggleRetirement,
    tournamentToCsv,
    type Match,
    type MatchResult,
    type Tournament
  } from '$lib/tournament';

  let tournament: Tournament | null = null;
  let standings: ReturnType<typeof getStandings> = [];
  let currentRoundMatches: Match[] = [];
  let playoffMatches: Tournament['playoffMatches'] = [];
  let error = '';
  let nowMs = Date.now();
  let activeTab: 'round' | 'standings' | 'history' | 'settings' = 'round';

  function getCurrentRoundRecord() {
    if (!tournament) return null;
    return tournament.rounds.find((round) => round.round === tournament.currentRound) ?? null;
  }

  function refreshData() {
    if (!tournament) return;
    standings = getStandings(tournament);
    currentRoundMatches = getCurrentRoundRecord()?.matches ?? [];
  }

  function loadTournament() {
    const raw = localStorage.getItem('magic-draft-current');
    if (!raw) {
      window.location.href = `${base}/`;
      return;
    }
    tournament = JSON.parse(raw) as Tournament;
    refreshData();
  }

  function persist() {
    if (!tournament) return;
    tournament.updatedAt = new Date().toISOString();
    saveTournamentRecord(tournament);
    localStorage.setItem('magic-draft-current', JSON.stringify(tournament));
    refreshData();
  }

  onMount(() => {
    loadTournament();
    const interval = setInterval(() => {
      nowMs = Date.now();
    }, 1000);

    return () => clearInterval(interval);
  });

  function recordResult(matchId: string, result: MatchResult) {
    if (!tournament) return;
    try {
      tournament = setResultForMatch(tournament, matchId, result);
      persist();
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : 'Error al registrar el resultado.';
    }
  }

  function closeRound() {
    if (!tournament) return;
    try {
      const ok = confirm('¿Quieres cerrar la ronda actual y generar la siguiente?');
      if (!ok) return;
      tournament = closeCurrentRound(tournament);
      persist();
      error = '';
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : 'No se pudo cerrar la ronda.';
    }
  }

  function generateRound() {
    if (!tournament) return;
    try {
      tournament = generateNextRound(tournament);
      persist();
      error = '';
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : 'No se pudo generar la ronda.';
    }
  }

  function exportJson() {
    if (!tournament) return;
    const blob = new Blob([serializeTournament(tournament)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tournament.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!tournament) return;
    const csv = tournamentToCsv(tournament);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tournament.name.toLowerCase().replace(/\s+/g, '-')}-clasificacion.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renameTournament() {
    if (!tournament) return;
    const nextName = prompt('Nuevo nombre del torneo', tournament.name);
    if (nextName === null) return;
    tournament.name = nextName.trim() || tournament.name;
    persist();
  }

  function togglePlayerRetired(playerId: string) {
    if (!tournament) return;
    const player = tournament.players.find((entry) => entry.id === playerId);
    if (!player) return;
    tournament = toggleRetirement(tournament, playerId, !player.retired);
    persist();
  }

  function setPlayoffWinner(matchId: string, winnerId: string) {
    if (!tournament) return;
    try {
      tournament = setPlayoffMatchWinner(tournament, matchId, winnerId);
      persist();
      error = '';
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : 'No se pudo guardar el resultado del playoff.';
    }
  }

  function generateInitialRound() {
    if (!tournament) return;
    tournament = generateRoundOne(tournament);
    persist();
  }

  function startCurrentRoundTimer() {
    if (!tournament) return;
    tournament = startRoundTimer(tournament, tournament.roundDurationMinutes ?? 30);
    persist();
  }

  function updateRoundDurationMinutes(value: string) {
    if (!tournament) return;
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    tournament.roundDurationMinutes = minutes;
    persist();
  }

  function formatRoundTime(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function playerNameById(playerId: string | null | undefined) {
    return tournament?.players.find((player) => player.id === playerId)?.name ?? 'Jugador';
  }

  function getMatchTitle(match: Match) {
    return `${playerNameById(match.player1Id)} vs ${playerNameById(match.player2Id)}`;
  }

  function isWinnerOption(match: Match, candidate: MatchResult) {
    return match.result === candidate;
  }

  function getMatchSummary(match: Match) {
    if (!match.result) {
      return { winner: null, loser: null, status: 'Pendiente' };
    }

    if (match.result === 'draw') {
      return {
        winner: null,
        loser: null,
        status: 'Empate'
      };
    }

    const winnerId = match.result === 'player1' ? match.player1Id : match.player2Id;
    const loserId = match.result === 'player1' ? match.player2Id : match.player1Id;
    return {
      winner: playerNameById(winnerId),
      loser: playerNameById(loserId),
      status: 'Confirmado'
    };
  }

  $: if (tournament) {
    const roundRecord = getCurrentRoundRecord();
    currentRoundMatches = roundRecord?.matches ?? [];
    playoffMatches = tournament.playoffMatches ?? [];
  }

  $: roundDurationMs = tournament ? (tournament.roundDurationMinutes ?? 30) * 60 * 1000 : 30 * 60 * 1000;
  $: roundDeadlineMs = tournament && tournament.roundTimerStartedAt ? Date.parse(tournament.roundTimerStartedAt) + roundDurationMs : null;
  $: roundRemainingMs = roundDeadlineMs !== null ? Math.max(0, roundDeadlineMs - nowMs) : roundDurationMs;
  $: roundTimerExpired = roundRemainingMs <= 0;
  $: debugInfo = tournament ? getTournamentAccuracySnapshot(tournament) : null;
</script>

{#if tournament}
  <div class="min-h-screen bg-slate-950 p-4 pb-28 text-slate-100">
    <div class="mx-auto max-w-6xl space-y-5">
      <header class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-cyan-400">Magic Draft</p>
            <h1 class="mt-1 text-2xl font-bold">{tournament.name}</h1>
            <p class="text-sm text-slate-300">
              Ronda {tournament.currentRound} de {tournament.totalRounds}
              <span class={`ml-2 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${roundTimerExpired ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'}`}>
                {formatRoundTime(roundRemainingMs)}
              </span>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="rounded-lg bg-slate-700 px-3 py-2" on:click={() => (window.location.href = `${base}/`)}>Inicio</button>
            <button class="rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-slate-950" on:click={renameTournament}>Renombrar</button>
          </div>
        </div>
      </header>

      <nav class="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-2 md:grid-cols-4">
        <button class:selected={activeTab === 'round'} class="rounded-xl px-3 py-2" on:click={() => (activeTab = 'round')}>Ronda</button>
        <button class:selected={activeTab === 'standings'} class="rounded-xl px-3 py-2" on:click={() => (activeTab = 'standings')}>Clasificación</button>
        <button class:selected={activeTab === 'history'} class="rounded-xl px-3 py-2" on:click={() => (activeTab = 'history')}>Historial</button>
        <button class:selected={activeTab === 'settings'} class="rounded-xl px-3 py-2" on:click={() => (activeTab = 'settings')}>Ajustes</button>
      </nav>

      {#if error}
        <div class="rounded-xl border border-red-500 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      {/if}

      {#if activeTab === 'round'}
        <section class="space-y-4">
          {#if tournament.rounds.length === 0}
            <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p class="mb-3 text-slate-300">La ronda 1 aún no se ha generado.</p>
              <button class="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950" on:click={generateInitialRound}>Generar ronda 1</button>
            </div>
          {:else}
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {#each currentRoundMatches as match}
                <div class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <span class="text-sm text-slate-400">Mesa {match.table}</span>
                    <span class={`rounded-full border px-2 py-1 text-xs font-medium ${match.result ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>
                      {match.result ? 'Confirmado' : 'Pendiente'}
                    </span>
                  </div>

                  <h4 class="mb-3 text-base font-semibold text-slate-100">{getMatchTitle(match)}</h4>

                  <div class="space-y-2">
                    <button
                      class={`w-full rounded-xl border px-3 py-3 text-left transition ${isWinnerOption(match, 'player1') ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-100'}`}
                      on:click={() => recordResult(match.id, 'player1')}
                    >
                      <span class="block text-xs uppercase tracking-[0.2em] text-slate-400">Ganador</span>
                      <span class="font-medium">{playerNameById(match.player1Id)}</span>
                    </button>
                    <button
                      class={`w-full rounded-xl border px-3 py-3 text-left transition ${isWinnerOption(match, 'player2') ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-100'}`}
                      on:click={() => recordResult(match.id, 'player2')}
                    >
                      <span class="block text-xs uppercase tracking-[0.2em] text-slate-400">Ganador</span>
                      <span class="font-medium">{playerNameById(match.player2Id)}</span>
                    </button>
                    <button
                      class={`w-full rounded-xl border px-3 py-3 text-left transition ${match.result === 'draw' ? 'border-yellow-500 bg-yellow-500/15 text-yellow-200' : 'border-slate-700 bg-slate-800 text-slate-100'}`}
                      on:click={() => recordResult(match.id, 'draw')}
                    >
                      <span class="block text-xs uppercase tracking-[0.2em] text-slate-400">Resultado</span>
                      <span class="font-medium">Empate</span>
                    </button>
                  </div>
                </div>
              {/each}
            </div>

            {#if playoffMatches.length > 0}
              <div class="rounded-2xl border border-cyan-500/30 bg-slate-900 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <h3 class="text-lg font-semibold text-cyan-300">Playoffs</h3>
                  <span class="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">BO3</span>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                  {#each playoffMatches as match}
                    {#if match.player1Id && match.player2Id}
                      <div class="rounded-xl border border-slate-700 bg-slate-950 p-3">
                        <p class="mb-2 text-sm text-slate-400">{match.label}</p>
                        <div class="mb-2 flex items-center gap-2 text-sm font-medium">
                          <span class={`font-semibold ${match.winnerId === match.player1Id ? 'text-emerald-300' : 'text-slate-100'}`}>
                            {playerNameById(match.player1Id)}
                          </span>
                          <span class="text-slate-500">vs</span>
                          <span class={`font-semibold ${match.winnerId === match.player2Id ? 'text-emerald-300' : 'text-red-300'}`}>
                            {playerNameById(match.player2Id)}
                          </span>
                        </div>
                        {#if match.winnerId}
                          <p class="text-sm text-emerald-300">Ganador: {playerNameById(match.winnerId)}</p>
                        {:else}
                          <div class="grid grid-cols-2 gap-2">
                            <button class="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm hover:border-emerald-500 hover:text-emerald-200" on:click={() => match.player1Id && setPlayoffWinner(match.id, match.player1Id)}>Ganador: {playerNameById(match.player1Id)}</button>
                            <button class="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm hover:border-emerald-500 hover:text-emerald-200" on:click={() => match.player2Id && setPlayoffWinner(match.id, match.player2Id)}>Ganador: {playerNameById(match.player2Id)}</button>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}

            <div class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p class="text-sm text-slate-400">Estado de la ronda</p>
                  <p class="font-semibold">{currentRoundMatches.every((match) => match.result !== null) ? 'Lista para cerrar' : 'Pendiente'}</p>
                  <div class="mt-3 space-y-2 text-sm text-slate-300">
                    {#each currentRoundMatches as match}
                      <div class="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                        <span class="font-medium text-slate-200">Mesa {match.table}</span>
                        {#if match.result === null}
                          <span class="text-slate-400">Sin resultado</span>
                        {:else if match.result === 'draw'}
                          <span class="text-yellow-300">Empate</span>
                        {:else}
                          {@const summary = getMatchSummary(match)}
                          <div class="flex items-center gap-2 text-xs md:text-sm">
                            <span class="font-semibold text-emerald-300">{summary.winner}</span>
                            <span class="text-slate-500">vs</span>
                            <span class="font-semibold text-red-300">{summary.loser}</span>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button class="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-slate-950" on:click={startCurrentRoundTimer}>{tournament.roundTimerStartedAt ? 'Reiniciar temporizador' : 'Iniciar ronda'}</button>
                  {#if tournament.currentRound < tournament.totalRounds}
                    <button class="rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950" on:click={closeRound}>Cerrar ronda</button>
                  {:else}
                    <button class="rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950" on:click={closeRound}>Ver clasificación final</button>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if activeTab === 'standings'}
        <section class="space-y-4">
          {#if playoffMatches.length > 0}
            <div class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-lg font-semibold text-cyan-300">Top 4 · Playoffs BO3</h3>
                <span class="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">Semifinales</span>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                {#each playoffMatches as match}
                  <div class="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                    <p class="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">{match.label} · BO3</p>

                    {#if match.player1Id && match.player2Id}
                      <div class="space-y-2">
                        <button
                          class={`w-full rounded-xl border px-3 py-3 text-left transition ${match.winnerId === match.player1Id ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-100'}`}
                          on:click={() => match.player1Id && setPlayoffWinner(match.id, match.player1Id)}
                        >
                          <span class="block text-xs uppercase tracking-[0.2em] text-slate-400">Ganador</span>
                          <span class="font-semibold">{playerNameById(match.player1Id)}</span>
                        </button>
                        <button
                          class={`w-full rounded-xl border px-3 py-3 text-left transition ${match.winnerId === match.player2Id ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 bg-slate-800 text-slate-100'}`}
                          on:click={() => match.player2Id && setPlayoffWinner(match.id, match.player2Id)}
                        >
                          <span class="block text-xs uppercase tracking-[0.2em] text-slate-400">Ganador</span>
                          <span class="font-semibold">{playerNameById(match.player2Id)}</span>
                        </button>
                      </div>
                    {/if}

                    {#if match.winnerId}
                      <p class="mt-3 text-sm text-emerald-300">Ganador: {playerNameById(match.winnerId)}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <section class="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <table class="min-w-full text-left text-sm">
              <thead>
                <tr class="text-slate-400">
                  <th class="px-2 py-3">Pos.</th>
                  <th class="px-2 py-3">Jugador</th>
                  <th class="px-2 py-3">Récord</th>
                  <th class="px-2 py-3">Puntos</th>
                  <th class="px-2 py-3">Buchholz</th>
                  <th class="px-2 py-3">OMW%</th>
                  <th class="px-2 py-3">% victorias</th>
                  <th class="px-2 py-3">Estado</th>
                  <th class="px-2 py-3">Rivales</th>
                </tr>
              </thead>
              <tbody>
                {#each standings as standing}
                  <tr class="border-t border-slate-800">
                    <td class="px-2 py-3">{standing.position}</td>
                    <td class="px-2 py-3">{standing.playerName}</td>
                    <td class="px-2 py-3">{standing.record}</td>
                    <td class="px-2 py-3">{standing.matchPoints}</td>
                    <td class="px-2 py-3">{standing.buchholz}</td>
                    <td class="px-2 py-3">{(standing.omw * 100).toFixed(2)} %</td>
                    <td class="px-2 py-3">{(standing.winPercentage * 100).toFixed(2)} %</td>
                    <td class="px-2 py-3">{standing.retired ? 'Retirado' : 'Activo'}</td>
                    <td class="px-2 py-3">{standing.rivals}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        </section>
      {/if}

      {#if activeTab === 'history'}
        <section class="space-y-4">
          {#each tournament.rounds as round}
            <div class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h3 class="mb-2 text-lg font-semibold">Ronda {round.round}</h3>
              <div class="space-y-2">
                {#each round.matches as match}
                  <div class="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <p class="mb-1 text-sm text-slate-400">Mesa {match.table}</p>
                    {#if match.result === null}
                      <p class="font-medium text-slate-100">{getMatchTitle(match)}</p>
                      <p class="text-sm text-slate-400">Resultado: Pendiente</p>
                    {:else if match.result === 'draw'}
                      <p class="font-medium text-slate-100">{getMatchTitle(match)}</p>
                      <p class="text-sm text-yellow-300">Empate</p>
                    {:else}
                      {@const summary = getMatchSummary(match)}
                      <p class="font-medium">
                        <span class="font-semibold text-emerald-300">{playerNameById(match.result === 'player1' ? match.player1Id : match.player2Id)}</span>
                        <span class="mx-2 text-slate-500">vs</span>
                        <span class="font-semibold text-red-300">{playerNameById(match.result === 'player1' ? match.player2Id : match.player1Id)}</span>
                      </p>
                      <p class="mt-2 text-sm">
                        <span class="font-semibold text-emerald-300">Ganador: {summary.winner}</span>
                      </p>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}

          {#if playoffMatches.length > 0}
            <div class="rounded-2xl border border-cyan-500/30 bg-slate-900 p-4">
              <h3 class="mb-2 text-lg font-semibold text-cyan-300">Playoffs</h3>
              <div class="space-y-2">
                {#each playoffMatches as match}
                  {#if match.player1Id && match.player2Id}
                    <div class="rounded-xl border border-slate-700 bg-slate-950 p-3">
                      <p class="mb-1 text-sm text-slate-400">{match.label}</p>
                      <p class="font-medium">
                        <span class={`font-semibold ${match.winnerId === match.player1Id ? 'text-emerald-300' : 'text-slate-100'}`}>
                          {playerNameById(match.player1Id)}
                        </span>
                        <span class="mx-2 text-slate-500">vs</span>
                        <span class={`font-semibold ${match.winnerId === match.player2Id ? 'text-emerald-300' : 'text-red-300'}`}>
                          {playerNameById(match.player2Id)}
                        </span>
                      </p>
                      {#if match.winnerId}
                        <p class="mt-2 text-sm font-semibold text-emerald-300">Ganador: {playerNameById(match.winnerId)}</p>
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if activeTab === 'settings'}
        <section class="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div class="flex flex-wrap gap-3">
            <button class="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950" on:click={exportJson}>Exportar torneo</button>
            <button class="rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950" on:click={exportCsv}>Exportar CSV</button>
            <button class="rounded-xl bg-red-500 px-4 py-3 font-semibold text-white" on:click={() => { if (confirm('¿Eliminar torneo?')) { localStorage.removeItem('magic-draft-current'); window.location.href = `${base}/`; } }}>Eliminar torneo</button>
          </div>

          <div class="rounded-xl border border-slate-700 bg-slate-950 p-3">
            <label for="round-duration" class="mb-2 block text-sm font-medium text-slate-300">Duración de la ronda (minutos)</label>
            <select
              id="round-duration"
              class="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={String(tournament?.roundDurationMinutes ?? 30)}
              on:change={(event) => updateRoundDurationMinutes(event.currentTarget.value)}
            >
              <option value="10">10 minutos</option>
              <option value="15">15 minutos</option>
              <option value="20">20 minutos</option>
              <option value="30">30 minutos</option>
              <option value="45">45 minutos</option>
              <option value="60">60 minutos</option>
            </select>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            {#each tournament.players as player}
              <label class="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 p-3">
                <span>{player.name}</span>
                <button class="rounded-lg bg-slate-700 px-3 py-2" on:click={() => togglePlayerRetired(player.id)}>{player.retired ? 'Reactivar' : 'Retirado'}</button>
              </label>
            {/each}
          </div>

          {#if debugInfo}
            <div class="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
              <p class="font-semibold text-cyan-300">Depuración de emparejamientos</p>
              <p>Rondas restantes: {debugInfo.remainingRounds}</p>
              <p>Calendario viable: {debugInfo.feasible ? 'Sí' : 'No'}</p>
              {#if debugInfo.reason}
                <p>Motivo: {debugInfo.reason}</p>
              {/if}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </div>
{:else}
  <div class="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
    <p>Cargando torneo...</p>
  </div>
{/if}

<style>
  .selected {
    background: rgba(34, 211, 238, 0.15);
    color: #67e8f9;
    border: 1px solid rgba(103, 232, 249, 0.4);
  }
</style>
