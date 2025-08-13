const errorMessages = require('./errorMessages.js');
const errorCodes = require('./errorCodes.js');

const ERROR_CODE_TO_MESSAGE = {
	[errorCodes.ERR_MISSING_PASSPHRASE]: errorMessages.KEY_PAIR_ERROR,
	[errorCodes.ERR_OSSL_BAD_DECRYPT]: errorMessages.KEY_PAIR_ERROR,
	[errorCodes.ERR_INVALID_USERNAME]: errorMessages.KEY_PAIR_ERROR,
};

const getKeyPairConnectionErrorMessageByCode = code => ERROR_CODE_TO_MESSAGE[code];

module.exports = {
	getKeyPairConnectionErrorMessageByCode,
};
