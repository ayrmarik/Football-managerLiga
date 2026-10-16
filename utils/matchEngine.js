/**
 * Простая симуляция матча
 * Считаем силу атаки и защиты команд и генерируем счёт
 */
function getTeamStrength(players) {
  if (!players || players.length === 0) {
    return { attack: 40, defense: 40, overall: 40 };
  }

  const attackers = players.filter(p => ['ST', 'AM', 'LW', 'RW', 'CM'].includes(p.position));
  const defenders = players.filter(p => ['GK', 'CB', 'LB', 'RB', 'CDM'].includes(p.position));

  const attack = attackers.length
    ? attackers.reduce((sum, p) => sum + p.attack + p.skill, 0) / attackers.length
    : 40;

  const defense = defenders.length
    ? defenders.reduce((sum, p) => sum + p.defense + p.skill, 0) / defenders.length
    : 40;

  const overall = players.reduce((sum, p) => sum + p.skill, 0) / players.length;

  return { attack, defense, overall };
}

function simulateMatch(homePlayers, awayPlayers) {
  const home = getTeamStrength(homePlayers);
  const away = getTeamStrength(awayPlayers);

  // Базовые ожидаемые голы
  let homeXG = (home.attack / away.defense) * 1.3;
  let awayXG = (away.attack / home.defense) * 1.1; // хозяева чуть сильнее

  // Случайность
  homeXG *= 0.7 + Math.random() * 0.6;
  awayXG *= 0.7 + Math.random() * 0.6;

  // Переводим xG в голы (упрощённо)
  const homeGoals = Math.max(0, Math.round(homeXG + (Math.random() - 0.5) * 1.5));
  const awayGoals = Math.max(0, Math.round(awayXG + (Math.random() - 0.5) * 1.5));

  return {
    homeGoals,
    awayGoals,
    homeXG: homeXG.toFixed(2),
    awayXG: awayXG.toFixed(2)
  };
}

module.exports = { simulateMatch, getTeamStrength };
