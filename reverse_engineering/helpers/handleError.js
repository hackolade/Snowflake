const { getKeyPairConnectionErrorMessageByCode } = require('../../common/getKeyPairConnectionErrorMessageByCode.js');

const handleError = (logger, error, cb) => {
	logger.log('error', { error }, 'Reverse Engineering error');

	const keyPairConnectionErrorMessage = getKeyPairConnectionErrorMessageByCode(error.code);
	if (keyPairConnectionErrorMessage) {
		return cb({
			message: keyPairConnectionErrorMessage,
			type: 'simpleError',
		});
	}

	if (typeof error === 'string') {
		return cb({ message: error });
	}

	const message = error?.message ?? 'Reverse Engineering error';

	return cb({ message });
};

module.exports = {
	handleError,
};
