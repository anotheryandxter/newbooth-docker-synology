const express = require('express');
const bcrypt = require('bcrypt');

module.exports = function(db) {
  const router = express.Router();

  // Get all users (excluding password hashes)
  router.get('/', (req, res) => {
    try {
      const users = db.prepare(`
        SELECT id, username, email, role, created_at, last_login, is_active
        FROM users
        ORDER BY created_at DESC
      `).all();

      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single user
  router.get('/:id', (req, res) => {
    try {
      const user = db.prepare(`
        SELECT id, username, email, role, created_at, last_login, is_active
        FROM users
        WHERE id = ?
      `).get(req.params.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create new user
  router.post('/', (req, res) => {
    try {
      const { username, password, email, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      // Check if username already exists
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      // Hash password
      const passwordHash = bcrypt.hashSync(password, 10);

      // Insert user
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, email, role)
        VALUES (?, ?, ?, ?)
      `).run(username, passwordHash, email || null, role || 'admin');

      res.status(201).json({
        id: result.lastInsertRowid,
        username,
        email,
        role: role || 'admin',
        message: 'User created successfully'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update user
  router.put('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { username, password, email, role, is_active } = req.body;

      // Check if user exists
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Build update query dynamically
      const updates = [];
      const values = [];

      if (username !== undefined) {
        updates.push('username = ?');
        values.push(username);
      }

      if (password !== undefined && password.length > 0) {
        updates.push('password_hash = ?');
        values.push(bcrypt.hashSync(password, 10));
      }

      if (email !== undefined) {
        updates.push('email = ?');
        values.push(email);
      }

      if (role !== undefined) {
        updates.push('role = ?');
        values.push(role);
      }

      if (is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(id);

      db.prepare(`
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...values);

      res.json({ message: 'User updated successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete user
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;

      // Prevent deleting the last admin
      const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "admin" AND is_active = 1').get();
      const user = db.prepare('SELECT role FROM users WHERE id = ?').get(id);

      if (user && user.role === 'admin' && adminCount.count <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user' });
      }

      const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Change password (current user)
  router.post('/change-password', (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user?.id; // From auth middleware

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
      }

      // Verify current password
      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
      if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Update password
      const newPasswordHash = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, userId);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
