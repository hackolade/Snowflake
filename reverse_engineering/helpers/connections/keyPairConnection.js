const fs = require('fs');
const crypto = require('crypto');
const { connectWithTimeout } = require('./connection.js');
const errorCodes = require('../../../common/errorCodes.js');

const authByKeyPair = ({ account, role, timeout, username, privateKeyPath, privateKeyPass }) => {
	if (
		!isValidPrivateKey({
			privateKeyPath,
			privateKeyPass,
		})
	) {
		return Promise.reject({
			code: errorCodes.ERR_INVALID_KEY_FILE,
		});
	}

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

const isValidPrivateKey = ({ privateKeyPath, privateKeyPass }) => {
	const textFilePrivateKeyFormat = 'pem';
	const fileContent = fs.readFileSync(privateKeyPath, 'utf8');

	try {
		crypto.createPrivateKey({
			key: fileContent,
			format: textFilePrivateKeyFormat,
			passphrase: privateKeyPass,
		});

		return true;
	} catch (error) {
		return false;
	}
};

module.exports = {
	authByKeyPair,
};
