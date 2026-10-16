const firstNames = [
  'Алексей', 'Иван', 'Дмитрий', 'Сергей', 'Андрей', 'Максим', 'Артём', 'Никита',
  'Кирилл', 'Егор', 'Даниил', 'Тимур', 'Роман', 'Владимир', 'Павел', 'Михаил',
  'Юрий', 'Олег', 'Виктор', 'Антон', 'Денис', 'Игорь', 'Станислав', 'Глеб',
  'Марк', 'Лев', 'Фёдор', 'Матвей', 'Ярослав', 'Савелий'
];

const lastNames = [
  'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов',
  'Михайлов', 'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев',
  'Семёнов', 'Егоров', 'Павлов', 'Козлов', 'Степанов', 'Николаев', 'Орлов',
  'Андреев', 'Макаров', 'Никитин', 'Захаров', 'Зайцев', 'Соловьёв', 'Борисов'
];

const positions = [
  'GK', 'CB', 'CB', 'LB', 'RB',
  'CDM', 'CM', 'CM', 'AM',
  'LW', 'RW', 'ST', 'ST'
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSkill(base = 50, variance = 20) {
  return Math.max(30, Math.min(90, Math.round(base + (Math.random() - 0.5) * variance * 2)));
}

function generatePlayer(teamId = null) {
  const position = randomFrom(positions);
  const name = `${randomFrom(firstNames)} ${randomFrom(lastNames)}`;
  const age = 17 + Math.floor(Math.random() * 18); // 17-34

  let skill, attack, defense, stamina, price;

  if (position === 'GK') {
    skill = randomSkill(55, 15);
    attack = randomSkill(20, 10);
    defense = randomSkill(65, 15);
  } else if (['CB', 'LB', 'RB', 'CDM'].includes(position)) {
    skill = randomSkill(55, 15);
    attack = randomSkill(35, 15);
    defense = randomSkill(65, 15);
  } else if (['CM', 'AM'].includes(position)) {
    skill = randomSkill(58, 15);
    attack = randomSkill(55, 15);
    defense = randomSkill(50, 15);
  } else {
    skill = randomSkill(60, 15);
    attack = randomSkill(68, 15);
    defense = randomSkill(35, 15);
  }

  stamina = randomSkill(60, 15);
  price = Math.round((skill * 8000) + (age < 23 ? 50000 : 0) + Math.random() * 100000);

  return {
    team_id: teamId,
    name,
    position,
    age,
    skill,
    attack,
    defense,
    stamina,
    price,
    is_on_transfer: 0,
    transfer_price: 0
  };
}

function generateSquad(teamId) {
  const squad = [];
  // Гарантируем минимальный набор
  const needed = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST'];
  for (const pos of needed) {
    const p = generatePlayer(teamId);
    p.position = pos;
    squad.push(p);
  }
  // Добавляем ещё 8 случайных
  for (let i = 0; i < 8; i++) {
    squad.push(generatePlayer(teamId));
  }
  return squad;
}

module.exports = { generatePlayer, generateSquad };
