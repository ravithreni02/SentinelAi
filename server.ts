import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('surveillance.db');

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS suspects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    risk_level TEXT CHECK(risk_level IN ('Low', 'Medium', 'High', 'Critical')),
    category TEXT DEFAULT 'Suspect',
    last_seen TEXT,
    description TEXT,
    image_url TEXT,
    status TEXT DEFAULT 'Active'
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    camera_id TEXT,
    location TEXT,
    suspect_id INTEGER,
    confidence REAL,
    behavior_flag TEXT,
    status TEXT DEFAULT 'Pending',
    FOREIGN KEY(suspect_id) REFERENCES suspects(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user TEXT,
    action TEXT,
    details TEXT
  );
`);

// Seed initial data if empty
const suspectCount = db.prepare('SELECT COUNT(*) as count FROM suspects').get() as { count: number };
if (suspectCount.count === 0) {
  const insert = db.prepare('INSERT INTO suspects (name, risk_level, category, description, status) VALUES (?, ?, ?, ?, ?)');
  insert.run('John Doe', 'High', 'Suspect', 'Suspected of multiple bank robberies. Known to wear dark hoodies.', 'Active');
  insert.run('Jane Smith', 'Critical', 'Suspect', 'Linked to organized crime. Last seen in downtown area.', 'Active');
  insert.run('Alice Johnson', 'Medium', 'Missing Person', 'Last seen near the central park. Wearing a red jacket.', 'Active');
  insert.run('Robert Miller', 'High', 'Missing Person', 'Elderly man with dementia. Last seen near the nursing home. Wearing a blue sweater.', 'Active');
  insert.run('Sarah Wilson', 'Medium', 'Missing Person', 'Teenager, last seen at the local high school. Wearing a green backpack.', 'Active');
  insert.run('David Brown', 'Low', 'Missing Person', 'Hiker, last seen on the north trail. Wearing hiking boots and a yellow hat.', 'Active');
} else {
  // Ensure category column exists for existing databases
  try {
    db.exec("ALTER TABLE suspects ADD COLUMN category TEXT DEFAULT 'Suspect'");
  } catch (e) {
    // Column already exists
  }
  
  // Add missing people if they don't exist
  const missingPeople = [
    ['Robert Miller', 'High', 'Missing Person', 'Elderly man with dementia. Last seen near the nursing home. Wearing a blue sweater.', 'Active'],
    ['Sarah Wilson', 'Medium', 'Missing Person', 'Teenager, last seen at the local high school. Wearing a green backpack.', 'Active'],
    ['David Brown', 'Low', 'Missing Person', 'Hiker, last seen on the north trail. Wearing hiking boots and a yellow hat.', 'Active']
  ];
  
  const check = db.prepare('SELECT id FROM suspects WHERE name = ?');
  const insert = db.prepare('INSERT INTO suspects (name, risk_level, category, description, status) VALUES (?, ?, ?, ?, ?)');
  
  const additionalSuspects = [
    ['Anjali Singh', 'High', 'Suspect', 'Young woman, dark hair tied back, neutral expression, wearing a beige t-shirt. Suspected of unauthorized access.', 'Active']
  ];

  for (const person of [...missingPeople, ...additionalSuspects]) {
    const exists = check.get(person[0]);
    if (!exists) {
      insert.run(...person);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/suspects', (req, res) => {
    const suspects = db.prepare('SELECT * FROM suspects').all();
    res.json(suspects);
  });

  app.post('/api/suspects', (req, res) => {
    const { name, risk_level, category, description, status, last_seen, image_url } = req.body;
    const info = db.prepare('INSERT INTO suspects (name, risk_level, category, description, status, last_seen, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, risk_level, category, description, status || 'Active', last_seen || null, image_url || null);
    res.json({ id: info.lastInsertRowid });
  });

  app.put('/api/suspects/:id', (req, res) => {
    const { id } = req.params;
    const { name, risk_level, category, description, status, last_seen, image_url } = req.body;
    db.prepare('UPDATE suspects SET name = ?, risk_level = ?, category = ?, description = ?, status = ?, last_seen = ?, image_url = ? WHERE id = ?')
      .run(name, risk_level, category, description, status, last_seen, image_url, id);
    res.sendStatus(200);
  });

  app.delete('/api/suspects/:id', (req, res) => {
    const { id } = req.params;
    // Also delete related alerts to avoid foreign key issues if needed, 
    // but here alerts has suspect_id as nullable or we can just delete.
    db.prepare('DELETE FROM alerts WHERE suspect_id = ?').run(id);
    db.prepare('DELETE FROM suspects WHERE id = ?').run(id);
    res.sendStatus(200);
  });

  app.post('/api/alerts', (req, res) => {
    const { camera_id, location, suspect_id, confidence, behavior_flag } = req.body;
    const info = db.prepare('INSERT INTO alerts (camera_id, location, suspect_id, confidence, behavior_flag) VALUES (?, ?, ?, ?, ?)')
      .run(camera_id, location, suspect_id, confidence, behavior_flag);
    res.json({ id: info.lastInsertRowid });
  });

  app.get('/api/alerts', (req, res) => {
    const alerts = db.prepare(`
      SELECT a.*, s.name as suspect_name, s.risk_level 
      FROM alerts a 
      LEFT JOIN suspects s ON a.suspect_id = s.id 
      ORDER BY a.timestamp DESC 
      LIMIT 50
    `).all();
    res.json(alerts);
  });

  app.post('/api/audit', (req, res) => {
    const { user, action, details } = req.body;
    db.prepare('INSERT INTO audit_logs (user, action, details) VALUES (?, ?, ?)').run(user, action, details);
    res.sendStatus(200);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SentinelAI Server running on http://localhost:${PORT}`);
  });
}

startServer();
