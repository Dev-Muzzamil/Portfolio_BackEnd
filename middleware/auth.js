const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware - verifies JWT token
module.exports.auth = async function(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        message: 'Access denied. Invalid token.',
        code: 'INVALID_TOKEN' 
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Access denied. Invalid token.',
        code: 'INVALID_TOKEN' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Access denied. Token expired.',
        code: 'TOKEN_EXPIRED' 
      });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Server error during authentication',
      code: 'AUTH_ERROR' 
    });
  }
};

// Admin-only middleware - checks if user has admin role
module.exports.adminOnly = function(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      message: 'Access denied. Authentication required.',
      code: 'AUTH_REQUIRED' 
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      message: 'Access denied. Admin privileges required.',
      code: 'ADMIN_REQUIRED' 
    });
  }
  
  next();
};
