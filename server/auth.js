// Database-backed authentication system
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Session store (in-memory for now, consider Redis for production)
const sessions = new Map();

// Generate session token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware to check admin authentication
function requireAdminAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ 
            success: false, 
            error: 'Unauthorized' 
        });
    }

    // Check if session is expired (30 minutes)
    const session = sessions.get(token);
    if (Date.now() - session.createdAt > 30 * 60 * 1000) {
        sessions.delete(token);
        return res.status(401).json({ 
            success: false, 
            error: 'Session expired' 
        });
    }

    // Attach user info to request
    req.user = session.user;
    next();
}

// Login endpoint - now uses database
function handleLogin(db) {
    return (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password required'
            });
        }

        try {
            // Find user in database
            const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
            }

            // Verify password
            const isValidPassword = bcrypt.compareSync(password, user.password_hash);

            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
            }

            // Update last login
            db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);

            // Create session
            const token = generateToken();
            sessions.set(token, {
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    email: user.email
                },
                createdAt: Date.now()
            });

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    email: user.email
                },
                message: 'Login successful'
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };
}

// Logout endpoint
function handleLogout(req, res) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        sessions.delete(token);
    }
    res.json({ 
        success: true, 
        message: 'Logged out successfully' 
    });
}

// Verify token endpoint
function handleVerify(req, res) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid token' 
        });
    }

    const session = sessions.get(token);
    // Verify expiry: align with requireAdminAuth (30 minutes)
    if (Date.now() - session.createdAt > 30 * 60 * 1000) {
        sessions.delete(token);
        return res.status(401).json({ 
            success: false, 
            error: 'Session expired' 
        });
    }

    res.json({ 
        success: true,
        user: session.user
    });
}

module.exports = {
    requireAdminAuth,
    handleLogin,
    handleLogout,
    handleVerify
};
