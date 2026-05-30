const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Database initialization
const db = new sqlite3.Database('./data/app.db', (err) => {
  if (err) console.error('Database connection failed:', err);
  else console.log('Connected to SQLite database');
});

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Data table
  db.run(`CREATE TABLE IF NOT EXISTS data (
    id INTEGER PRIMARY KEY,
    column1 TEXT,
    column2 TEXT,
    column3 TEXT,
    column4 TEXT,
    column5 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create default admin user (username: admin, password: admin123)
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
    ['admin', hashedPassword, 'admin']);

  // Create default user (username: user, password: user123)
  const userPassword = bcrypt.hashSync('user123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
    ['user', userPassword, 'user']);

  // Insert sample data
  db.run(`INSERT OR IGNORE INTO data (column1, column2, column3, column4, column5) VALUES (?, ?, ?, ?, ?)`,
    ['Sample 1', 'Value 1', 'Data 1', 'Info 1', 'Note 1']);
  db.run(`INSERT OR IGNORE INTO data (column1, column2, column3, column4, column5) VALUES (?, ?, ?, ?, ?)`,
    ['Sample 2', 'Value 2', 'Data 2', 'Info 2', 'Note 2']);
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/');
  }
};

// Routes

// Login page
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'public/login.html'));
  }
});

// Login handler
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) {
      return res.json({ success: false, message: 'Database error' });
    }

    if (!user) {
      return res.json({ success: false, message: 'Username not found' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.json({ success: false, message: 'Incorrect password' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    res.json({ success: true, role: user.role });
  });
});

// Logout handler
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Dashboard page
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Get all data
app.get('/api/data', isAuthenticated, (req, res) => {
  db.all(`SELECT * FROM data ORDER BY created_at DESC`, (err, rows) => {
    if (err) {
      return res.json({ success: false, message: 'Error fetching data' });
    }
    res.json({ success: true, data: rows });
  });
});

// Add new data (admin only)
app.post('/api/data', isAuthenticated, (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.json({ success: false, message: 'Unauthorized' });
  }

  const { column1, column2, column3, column4, column5 } = req.body;

  db.run(
    `INSERT INTO data (column1, column2, column3, column4, column5) VALUES (?, ?, ?, ?, ?)`,
    [column1, column2, column3, column4, column5],
    function(err) {
      if (err) {
        return res.json({ success: false, message: 'Error adding data' });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Update data (admin only)
app.put('/api/data/:id', isAuthenticated, (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.json({ success: false, message: 'Unauthorized' });
  }

  const { id } = req.params;
  const { column1, column2, column3, column4, column5 } = req.body;

  db.run(
    `UPDATE data SET column1=?, column2=?, column3=?, column4=?, column5=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [column1, column2, column3, column4, column5, id],
    (err) => {
      if (err) {
        return res.json({ success: false, message: 'Error updating data' });
      }
      res.json({ success: true });
    }
  );
});

// Delete data (admin only)
app.delete('/api/data/:id', isAuthenticated, (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.json({ success: false, message: 'Unauthorized' });
  }

  const { id } = req.params;

  db.run(`DELETE FROM data WHERE id=?`, [id], (err) => {
    if (err) {
      return res.json({ success: false, message: 'Error deleting data' });
    }
    res.json({ success: true });
  });
});

// Export to Excel
app.get('/api/export', isAuthenticated, (req, res) => {
  db.all(`SELECT * FROM data ORDER BY created_at DESC`, async (err, rows) => {
    if (err) {
      return res.json({ success: false, message: 'Error fetching data' });
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Data');

      // Add headers
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Column 1', key: 'column1', width: 20 },
        { header: 'Column 2', key: 'column2', width: 20 },
        { header: 'Column 3', key: 'column3', width: 20 },
        { header: 'Column 4', key: 'column4', width: 20 },
        { header: 'Column 5', key: 'column5', width: 20 }
      ];

      // Add data rows
      rows.forEach(row => {
        worksheet.addRow(row);
      });

      // Send file
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="data.xlsx"');
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      res.json({ success: false, message: 'Error exporting data' });
    }
  });
});

// Get current user info
app.get('/api/user', isAuthenticated, (req, res) => {
  res.json({
    username: req.session.user.username,
    role: req.session.user.role
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
