
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("JWT_SECRET missing. Check your .env file.");
  process.exit(1);
}

app.use(cors());
app.use(express.json());

// SQLite database
const db = new Database("tasks.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Authentication middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Please login first"
    });
  }

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
}

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users (name, email, password)
      VALUES (?, ?, ?)
    `).run(name.trim(), normalizedEmail, hashedPassword);

    res.status(201).json({
      message: "Registration successful",
      userId: result.lastInsertRowid
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        message: "Email already registered"
      });
    }

    console.error(error);
    res.status(500).json({
      message: "Registration failed"
    });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = db.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).get(normalizedEmail);

    if (
      !user ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Login failed"
    });
  }
});

// Get tasks for logged-in user
app.get("/api/tasks", authMiddleware, (req, res) => {
  const tasks = db.prepare(`
    SELECT id, title, description, status
    FROM tasks
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(req.user.id);

  res.json(tasks);
});

// Create task
app.post("/api/tasks", authMiddleware, (req, res) => {
  const { title, description = "" } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({
      message: "Task title is required"
    });
  }

  const result = db.prepare(`
    INSERT INTO tasks (user_id, title, description, status)
    VALUES (?, ?, ?, 'Pending')
  `).run(req.user.id, title.trim(), description);

  const task = db.prepare(`
    SELECT id, title, description, status
    FROM tasks
    WHERE id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(task);
});

// Update task
app.put("/api/tasks/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const { title, description = "", status } = req.body;

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      message: "Invalid task ID"
    });
  }

  if (!title || !title.trim()) {
    return res.status(400).json({
      message: "Task title is required"
    });
  }

  if (!["Pending", "Completed"].includes(status)) {
    return res.status(400).json({
      message: "Invalid task status"
    });
  }

  const result = db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, status = ?
    WHERE id = ? AND user_id = ?
  `).run(title.trim(), description, status, id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  const task = db.prepare(`
    SELECT id, title, description, status
    FROM tasks
    WHERE id = ? AND user_id = ?
  `).get(id, req.user.id);

  res.json(task);
});

// Delete task
app.delete("/api/tasks/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      message: "Invalid task ID"
    });
  }

  const result = db.prepare(`
    DELETE FROM tasks
    WHERE id = ? AND user_id = ?
  `).run(id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  res.json({
    message: "Task deleted successfully"
  });
});

// Health check
app.get("/", (req, res) => {
  res.send("TaskFlow API is running!");
});

// Allow access from phone on the same network
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
