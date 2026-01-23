const _ = require('lodash');
const { hckFetch } = require('@hackolade/fetch');
const snowflakeHelper = require('./snowflakeHelper');

const getSsoUrlData = async (logger, { host, redirectPort = 8080 }) => {
	logger.log('info', `Starting SSO connection...`, 'Connection');
	logger.log('info', `Redirect port: ${redirectPort}`, 'Connection');

	const account = snowflakeHelper.getAccount(host);
	const accessUrl = snowflakeHelper.getAccessUrl(account);
	const response = await hckFetch(`${accessUrl}/session/authenticator-request`, {
		method: 'POST',
		body: JSON.stringify({
			data: {
				AUTHENTICATOR: 'EXTERNALBROWSER',
				BROWSER_MODE_REDIRECT_PORT: redirectPort,
			},
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		return Promise.reject(new Error(`Cannot obtain the SSO URL. Status ${response.status} ${response.statusText}`));
	}

	const responseData = await response.json();

	const ssoUrl = _.get(responseData, 'data.ssoUrl', '');
	const proofKey = _.get(responseData, 'data.proofKey', '');
	logger.log('info', `SSO URL: ${ssoUrl}`, 'Connection');

	if (!ssoUrl) {
		return Promise.reject(new Error(`The SSO URL is nt provided in the JSON response`));
	}

	return { url: ssoUrl, proofKey };
};

module.exports = {
	getSsoUrlData,
};
