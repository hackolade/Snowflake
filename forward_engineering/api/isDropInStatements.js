const { DROP_STATEMENTS } = require('../helpers/constants.js');
const { generateScript } = require('./generateScript');
const { generateContainerScript } = require('./generateContainerScript');

function isDropInStatements(data, logger, callback, app) {
	try {
		const cb = (error, script = '') =>
			callback(
				error,
				DROP_STATEMENTS.some(statement => script.includes(statement)),
			);

		if (data.level === 'container') {
			generateContainerScript(data, logger, cb, app);
		} else {
			generateScript(data, logger, cb, app);
		}
	} catch (e) {
		callback({ message: e.message, stack: e.stack });
	}
}

module.exports = {
	isDropInStatements,
};
