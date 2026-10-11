# Magic Draft Manager

## Requisitos

- Node.js LTS
- Navegador moderno con soporte para PWA

## Instalación

1. Instala las dependencias:
   npm install
2. Inicia la app en modo desarrollo:
   npm run dev
3. Para ejecutar pruebas:
   npm run test
4. Para compilar la versión de producción:
   npm run build

## Cómo usar la app

- Crea un torneo con ocho jugadores.
- Genera la ronda 1.
- Registra el resultado de cada mesa con victoria o empate.
- Cierra la ronda y genera la siguiente.
- Revisa la clasificación actualizada y el historial completo.
- Exporta el torneo a JSON o la clasificación a CSV.

## PWA y Android

En Chrome para Android:

1. Abre la app en el navegador.
2. Toca el menú de Chrome.
3. Selecciona "Instalar aplicación" o "Añadir a pantalla de inicio".
4. La app queda disponible como PWA y puede seguir funcionando sin conexión tras la primera carga.

## Exportar e importar torneos

- El menú de Ajustes permite exportar el torneo completo en JSON.
- El mismo archivo puede volverse a importar en la pantalla de Inicio.
- La clasificación también puede exportarse como CSV.

## Algoritmo de emparejamientos

El motor del torneo usa un enfoque basado en matching perfecto con backtracking. Para cada ronda, genera todas las combinaciones posibles de 4 mesas sin repetir parejas, ordena las opciones por diferencia de puntos, Buchholz y OMW%, y valida que el resto del calendario sigue siendo viable. La validación `validateRemainingScheduleFeasibility()` comprueba que el grafo de enfrentamientos pendientes aún permite completar todas las rondas restantes.

## Por qué 8 jugadores y 7 rondas funciona

Con 8 jugadores, cada uno tiene 7 rivales posibles. Si el torneo se disputa en 7 rondas BO1, cada jugador puede enfrentarse exactamente una vez a cada rival, lo que genera exactamente 28 matches únicos. Eso es la suma de todas las combinaciones posibles entre 8 jugadores: 8 * 7 / 2 = 28.

## Buchholz y OMW%

- Buchholz: suma de los puntos de match de todos los rivales de un jugador. Se usa como desempate robusto.
- OMW%: promedio del porcentaje de victorias de los rivales de cada jugador, sin contar byes ni empates invalidos. En una versión BO1 y con 8 jugadores, interesa como criterio de desempate al final del torneo.

## Limitaciones de la versión 1

- Solo se soporta exactamente 8 jugadores.
- La retirada de un jugador bloquea la generación automática de futuras rondas.
- El formato BO1 es fijo y no contempla otros tamaños de campo.

## Scripts

- npm install
- npm run dev
- npm run test
- npm run build
