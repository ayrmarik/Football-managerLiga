const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db/database');
const { simulateMatch } = require('./utils/matchEngine');
const { generateSquad } = require('./utils/playerGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'football-manager-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 дней
}));

// Делаем user доступным во всех шаблонах
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ========== Хелперы ==========
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.status(403).send('Доступ запрещён');
  next();
}

function getUserTeam(userId) {
  return db.prepare('SELECT * FROM teams WHERE user_id = ?').get(userId);
}

// ========== Роуты ==========

// Главная
app.get('/', (req, res) => {
  const teamsCount = db.prepare('SELECT COUNT(*) as c FROM teams').get().c;
  const usersCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const matchesCount = db.prepare('SELECT COUNT(*) as c FROM matches WHERE status = ?').get('played').c;
  res.render('index', { teamsCount, usersCount, matchesCount });
});

// Регистрация
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  const { username, password, teamName } = req.body;
  if (!username || !password || !teamName) {
    return res.render('register', { error: 'Заполни все поля' });
  }
  if (password.length < 4) {
    return res.render('register', { error: 'Пароль минимум 4 символа' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
    const userId = result.lastInsertRowid;

    // Создаём команду
    const teamResult = db.prepare('INSERT INTO teams (user_id, name, short_name) VALUES (?, ?, ?)').run(
      userId, teamName, teamName.substring(0, 3).toUpperCase()
    );
    const teamId = teamResult.lastInsertRowid;

    // Генерируем состав
    const squad = generateSquad(teamId);
    const insertPlayer = db.prepare(`
      INSERT INTO players (team_id, name, position, age, skill, attack, defense, stamina, price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of squad) {
      insertPlayer.run(p.team_id, p.name, p.position, p.age, p.skill, p.attack, p.defense, p.stamina, p.price);
    }

    // Добавляем в лигу
    const league = db.prepare('SELECT id FROM leagues WHERE is_active = 1 LIMIT 1').get();
    if (league) {
      db.prepare('INSERT INTO league_teams (league_id, team_id) VALUES (?, ?)').run(league.id, teamId);
    }

    req.session.user = { id: userId, username, is_admin: 0 };
    res.redirect('/dashboard');
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.render('register', { error: 'Такой логин уже занят' });
    }
    console.error(e);
    res.render('register', { error: 'Ошибка регистрации' });
  }
});

// Вход
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { error: 'Неверный логин или пароль' });
  }
  req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Дашборд
app.get('/dashboard', requireAuth, (req, res) => {
  const team = getUserTeam(req.session.user.id);
  let players = [];
  let leagueInfo = null;
  let recentMatches = [];

  if (team) {
    players = db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY skill DESC').all(team.id);
    leagueInfo = db.prepare(`
      SELECT lt.*, l.name as league_name 
      FROM league_teams lt 
      JOIN leagues l ON l.id = lt.league_id 
      WHERE lt.team_id = ?
    `).get(team.id);

    recentMatches = db.prepare(`
      SELECT m.*, 
        ht.name as home_name, at.name as away_name
      FROM matches m
      JOIN teams ht ON ht.id = m.home_team_id
      JOIN teams at ON at.id = m.away_team_id
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'played'
      ORDER BY m.played_at DESC LIMIT 5
    `).all(team.id, team.id);
  }

  res.render('dashboard', { team, players, leagueInfo, recentMatches });
});

// Состав
app.get('/squad', requireAuth, (req, res) => {
  const team = getUserTeam(req.session.user.id);
  if (!team) return res.redirect('/dashboard');
  const players = db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY position, skill DESC').all(team.id);
  res.render('squad', { team, players });
});

// Таблица лиги
app.get('/league', requireAuth, (req, res) => {
  const league = db.prepare('SELECT * FROM leagues WHERE is_active = 1 LIMIT 1').get();
  if (!league) return res.render('league', { league: null, table: [] });

  const table = db.prepare(`
    SELECT lt.*, t.name as team_name, u.username
    FROM league_teams lt
    JOIN teams t ON t.id = lt.team_id
    JOIN users u ON u.id = t.user_id
    WHERE lt.league_id = ?
    ORDER BY lt.points DESC, (lt.goals_for - lt.goals_against) DESC, lt.goals_for DESC
  `).all(league.id);

  res.render('league', { league, table });
});

// Трансферы
app.get('/transfers', requireAuth, (req, res) => {
  const team = getUserTeam(req.session.user.id);
  const onMarket = db.prepare(`
    SELECT p.*, t.name as team_name 
    FROM players p 
    LEFT JOIN teams t ON t.id = p.team_id 
    WHERE p.is_on_transfer = 1
    ORDER BY p.transfer_price DESC
  `).all();

  const myPlayers = team
    ? db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY skill DESC').all(team.id)
    : [];

  res.render('transfers', { team, onMarket, myPlayers, message: null });
});

app.post('/transfers/list', requireAuth, (req, res) => {
  const team = getUserTeam(req.session.user.id);
  if (!team) return res.redirect('/transfers');

  const { playerId, price } = req.body;
  const player = db.prepare('SELECT * FROM players WHERE id = ? AND team_id = ?').get(playerId, team.id);
  if (!player) return res.redirect('/transfers');

  db.prepare('UPDATE players SET is_on_transfer = 1, transfer_price = ? WHERE id = ?')
    .run(parseInt(price) || player.price, playerId);

  res.redirect('/transfers');
});

app.post('/transfers/buy', requireAuth, (req, res) => {
  const team = getUserTeam(req.session.user.id);
  if (!team) return res.redirect('/transfers');

  const { playerId } = req.body;
  const player = db.prepare('SELECT * FROM players WHERE id = ? AND is_on_transfer = 1').get(playerId);
  if (!player) return res.redirect('/transfers');

  if (team.budget < player.transfer_price) {
    const onMarket = db.prepare(`SELECT p.*, t.name as team_name FROM players p LEFT JOIN teams t ON t.id = p.team_id WHERE p.is_on_transfer = 1`).all();
    const myPlayers = db.prepare('SELECT * FROM players WHERE team_id = ?').all(team.id);
    return res.render('transfers', { team, onMarket, myPlayers, message: 'Не хватает денег!' });
  }

  // Переводим деньги
  if (player.team_id) {
    db.prepare('UPDATE teams SET budget = budget + ? WHERE id = ?').run(player.transfer_price, player.team_id);
  }
  db.prepare('UPDATE teams SET budget = budget - ? WHERE id = ?').run(player.transfer_price, team.id);

  // Переводим игрока
  db.prepare('UPDATE players SET team_id = ?, is_on_transfer = 0, transfer_price = 0 WHERE id = ?')
    .run(team.id, playerId);

  res.redirect('/transfers');
});

app.post('/transfers/unlist', requireAuth, (req, res) => {
  const team = getUserTeam(req.session.user.id);
  const { playerId } = req.body;
  db.prepare('UPDATE players SET is_on_transfer = 0, transfer_price = 0 WHERE id = ? AND team_id = ?')
    .run(playerId, team.id);
  res.redirect('/transfers');
});

// Сыграть матч (против случайной команды или товарищеский)
app.post('/play-friendly', requireAuth, (req, res) => {
  const myTeam = getUserTeam(req.session.user.id);
  if (!myTeam) return res.redirect('/dashboard');

  // Находим случайную другую команду
  const opponent = db.prepare('SELECT * FROM teams WHERE id != ? ORDER BY RANDOM() LIMIT 1').get(myTeam.id);
  if (!opponent) {
    return res.send('Нет других команд для матча. Позови друзей!');
  }

  const homePlayers = db.prepare('SELECT * FROM players WHERE team_id = ?').all(myTeam.id);
  const awayPlayers = db.prepare('SELECT * FROM players WHERE team_id = ?').all(opponent.id);

  const result = simulateMatch(homePlayers, awayPlayers);

  db.prepare(`
    INSERT INTO matches (home_team_id, away_team_id, home_goals, away_goals, status, played_at)
    VALUES (?, ?, ?, ?, 'played', CURRENT_TIMESTAMP)
  `).run(myTeam.id, opponent.id, result.homeGoals, result.awayGoals);

  res.redirect('/dashboard');
});

// ========== АДМИНКА ==========
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT u.*, t.name as team_name FROM users u LEFT JOIN teams t ON t.user_id = u.id').all();
  const leagues = db.prepare('SELECT * FROM leagues').all();
  const matches = db.prepare(`
    SELECT m.*, ht.name as home_name, at.name as away_name 
    FROM matches m 
    JOIN teams ht ON ht.id = m.home_team_id 
    JOIN teams at ON at.id = m.away_team_id 
    ORDER BY m.id DESC LIMIT 20
  `).all();

  res.render('admin', { users, leagues, matches });
});

// Админ: сыграть тур матчей в лиге
app.post('/admin/play-round', requireAuth, requireAdmin, (req, res) => {
  const league = db.prepare('SELECT * FROM leagues WHERE is_active = 1 LIMIT 1').get();
  if (!league) return res.redirect('/admin');

  const teams = db.prepare('SELECT team_id FROM league_teams WHERE league_id = ?').all(league.id);
  if (teams.length < 2) return res.redirect('/admin');

  // Простая схема: каждый играет с каждым (берём пары)
  const teamIds = teams.map(t => t.team_id);
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const homeId = teamIds[i];
      const awayId = teamIds[j];

      // Проверяем, не играли ли уже
      const existing = db.prepare(`
        SELECT id FROM matches 
        WHERE ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
        AND league_id = ?
      `).get(homeId, awayId, awayId, homeId, league.id);

      if (existing) continue;

      const homePlayers = db.prepare('SELECT * FROM players WHERE team_id = ?').all(homeId);
      const awayPlayers = db.prepare('SELECT * FROM players WHERE team_id = ?').all(awayId);
      const result = simulateMatch(homePlayers, awayPlayers);

      db.prepare(`
        INSERT INTO matches (league_id, home_team_id, away_team_id, home_goals, away_goals, status, played_at)
        VALUES (?, ?, ?, ?, ?, 'played', CURRENT_TIMESTAMP)
      `).run(league.id, homeId, awayId, result.homeGoals, result.awayGoals);

      // Обновляем таблицу
      updateLeagueTable(league.id, homeId, awayId, result.homeGoals, result.awayGoals);
    }
  }

  res.redirect('/admin');
});

function updateLeagueTable(leagueId, homeId, awayId, homeGoals, awayGoals) {
  const update = (teamId, gf, ga, result) => {
    if (result === 'win') {
      db.prepare(`
        UPDATE league_teams SET played = played + 1, won = won + 1, 
        goals_for = goals_for + ?, goals_against = goals_against + ?, points = points + 3
        WHERE league_id = ? AND team_id = ?
      `).run(gf, ga, leagueId, teamId);
    } else if (result === 'draw') {
      db.prepare(`
        UPDATE league_teams SET played = played + 1, drawn = drawn + 1, 
        goals_for = goals_for + ?, goals_against = goals_against + ?, points = points + 1
        WHERE league_id = ? AND team_id = ?
      `).run(gf, ga, leagueId, teamId);
    } else {
      db.prepare(`
        UPDATE league_teams SET played = played + 1, lost = lost + 1, 
        goals_for = goals_for + ?, goals_against = goals_against + ?
        WHERE league_id = ? AND team_id = ?
      `).run(gf, ga, leagueId, teamId);
    }
  };

  if (homeGoals > awayGoals) {
    update(homeId, homeGoals, awayGoals, 'win');
    update(awayId, awayGoals, homeGoals, 'lose');
  } else if (homeGoals < awayGoals) {
    update(homeId, homeGoals, awayGoals, 'lose');
    update(awayId, awayGoals, homeGoals, 'win');
  } else {
    update(homeId, homeGoals, awayGoals, 'draw');
    update(awayId, awayGoals, homeGoals, 'draw');
  }
}

// Запуск
app.listen(PORT, () => {
  console.log(`⚽ Футбольный менеджер запущен: http://localhost:${PORT}`);
  console.log(`Админ: admin / admin123`);
});
