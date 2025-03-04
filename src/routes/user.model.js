const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

// Ruta para obtener usuarios
router.get('/', userController.getUsers);

// Ruta para crear un usuario
router.post('/', userController.createUser);

module.exports = router;
