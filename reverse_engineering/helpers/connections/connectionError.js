class ConnectionError extends Error {
	code;

	constructor(message, code) {
		super(message);
		this.code = code;
	}
}

module.exports = {
	ConnectionError,
};
