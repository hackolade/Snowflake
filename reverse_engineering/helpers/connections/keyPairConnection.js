const { connectWithTimeout } = require('./connection.js');

const authByKeyPair = ({ account, role, timeout, username, privateKeyPath, privateKeyPass }) => {
	return connectWithTimeout({
		account,
		role,
		timeout,
		username,
		authenticator: 'SNOWFLAKE_JWT',
		privateKeyPath,
		...(privateKeyPass && { privateKeyPass }),
	});
};

module.exports = {
	authByKeyPair,
};
