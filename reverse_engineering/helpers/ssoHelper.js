const axios = require('axios');
const snowflakeHelper = require('./snowflakeHelper');
const ssoAuthenticatorError = { message: "Can't get SSO URL. Please, check the SAML settings" };

const getSsoUrlData = async (logger, _, { host, redirectPort = 8080 }) => {
	const account = snowflakeHelper.getAccount(host);
	const accessUrl = snowflakeHelper.getAccessUrl(account);
	const ssoUrlsData = await axios.post(`${accessUrl}/session/authenticator-request`, {
		data: {
			AUTHENTICATOR: 'EXTERNALBROWSER',
			BROWSER_MODE_REDIRECT_PORT: redirectPort,
		},
	});

	logger.log('info', `Starting SSO connection...`, 'Connection');

	const ssoUrl = _.get(ssoUrlsData, 'data.data.ssoUrl', '');
	const proofKey = _.get(ssoUrlsData, 'data.data.proofKey', '');
	logger.log('info', `SSO URL: ${ssoUrl}`, 'Connection');

	if (!ssoUrl) {
		return Promise.reject(ssoAuthenticatorError);
	}

	return { url: ssoUrl, proofKey };
};

module.exports = {
	getSsoUrlData,
};
