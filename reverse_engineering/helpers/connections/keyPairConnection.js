const { connectWithTimeout } = require('./connection.js');

const authByKeyPair = ({ account, role, timeout, username, privateKeyPath, privateKeyPass }) => {
	try {
		return connectWithTimeout({
			account,
			role,
			timeout,
			username,
			authenticator: 'SNOWFLAKE_JWT',
			privateKeyPath,
			...(privateKeyPass && { privateKeyPass }),
		});
	} catch (err) {
		if (err.code === 'ERR_MISSING_PASSPHRASE') {
		}
	}
};

module.exports = {
	authByKeyPair,
};
