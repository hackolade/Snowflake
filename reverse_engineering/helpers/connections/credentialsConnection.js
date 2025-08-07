const { connectWithTimeout } = require('./connection.js');

const authByCredentials = ({ account, username, password, role, timeout, warehouse }) => {
	return connectWithTimeout({ account, username, password, role, timeout, warehouse });
};

module.exports = {
	authByCredentials,
};
