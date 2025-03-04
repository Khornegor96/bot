// services/user.service.js
const User = require('../models/user.model');

const createUser = async (data) => {
  const user = new User(data);
  return await user.save();
};

const getUsers = async () => {
  return await User.findAll({});

};

module.exports = {
  createUser,
  getUsers
};
