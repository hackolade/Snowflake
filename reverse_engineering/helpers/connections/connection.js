const snowflake = require('snowflake-sdk');

const errorMessages = require('../../../common/errorMessages.js');
const { CONNECTION_TIMED_OUT_CODE } = require('./constants.js');

const noConnectionError = { message: errorMessages.CONNECTION_ERROR };

let connection;

const connectWithTimeout = ({ timeout, ...options }, isErrorAllowed = () => false) => {
	const connectPromise = new Promise((resolve, reject) => {
		connection = snowflake.createConnection(options);
		connection.connect(err => {
			if (err && !isErrorAllowed(err)) {
				connection = null;
				return reject(err);
			}

			resolve();
		});
	});

	const timeoutPromise = new Promise((resolve, reject) =>
		setTimeout(() => reject(getConnectionTimeoutError(timeout)), timeout),
	);

	return Promise.race([connectPromise, timeoutPromise]).catch(error => {
		if (error.code === CONNECTION_TIMED_OUT_CODE) {
			disconnect();
		}

		throw error;
	});
};

const disconnect = () => {
	if (!connection) {
		return Promise.reject(noConnectionError);
	}

	return new Promise((resolve, reject) => {
		connection.destroy(err => {
			if (err) {
				return reject(err);
			}
			resolve();
		});
	});
};

const execute = command => {
	if (!connection) {
		return Promise.reject(noConnectionError);
	}
	return new Promise((resolve, reject) => {
		connection.execute({
			sqlText: command,
			complete: (err, statement, rows) => {
				if (err) {
					return reject(err);
				}
				resolve(rows);
			},
		});
	});
};

const getConnectionTimeoutError = timeout => {
	const error = new Error(`Connection timeout ${timeout} ms exceeded!`);
	error.code = CONNECTION_TIMED_OUT_CODE;

	return error;
};

const getConnection = () => connection;

module.exports = {
	getConnection,
	connectWithTimeout,
	disconnect,
	execute,
};
