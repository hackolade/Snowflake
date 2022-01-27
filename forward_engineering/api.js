'use strict'


module.exports = {
	generateScript(data, logger, callback) {
		callback(null, '');
	},

	generateContainerScript(data, logger, callback) {
		callback(null, '');
	},

  applyToInstance(connectionInfo, logger, callback, app) {
    const { applyToInstance } = require('./helpers/applyToInstanceHelper');

    applyToInstance(connectionInfo, logger, app)
      .then(result => {
        callback(null, result);
      })
      .catch(error => {
        const err = {
          message: error.message,
          stack: error.stack,
        };
        logger.log('error', err, 'Error when applying to instance');
        callback(err);
      });
  },
};
