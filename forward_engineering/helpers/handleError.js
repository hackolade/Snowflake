const errorMessages = require('../../common/errorMessages.js');
const errorCodes = require('../../common/errorCodes.js');

const handleError = (logger, error, callback) => {
	logger.log('error', error, 'Error when applying to instance');

	if (error.code === errorCodes.ERR_MISSING_PASSPHRASE || error.code === errorCodes.ERR_OSSL_BAD_DECRYPT) {
		return callback({
			message: errorMessages.KEY_PAIR_ERROR,
			type: 'simpleError',
		});
	}

	return callback({
		message: error.message,
		stack: error.stack,
	});
};

module.exports = {
	handleError,
};
