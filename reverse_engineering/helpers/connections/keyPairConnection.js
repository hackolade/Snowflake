const fs = require('fs');
const crypto = require('crypto');
const { connectWithTimeout } = require('./connection.js');
const errorCodes = require('../../../common/errorCodes.js');
const errorMessages = require('../../../common/errorMessages.js');
const { ConnectionError } = require('./connectionError.js');

const authByKeyPair = ({ account, role, timeout, username, privateKeyPath, privateKeyPass, logger }) => {
	if (
		!isValidPrivateKey({
			privateKeyPath,
			privateKeyPass,
			logger,
		})
	) {
		throw new ConnectionError(errorMessages.KEY_PAIR_INVALID_FILE_ERROR, errorCodes.ERR_INVALID_KEY_FILE);
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

const isValidPrivateKey = ({ privateKeyPath, privateKeyPass, logger }) => {
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
		logger.log('error', { error }, 'Connection error');
		return false;
	}
};

module.exports = {
	authByKeyPair,
};
