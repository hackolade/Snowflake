const _ = require('lodash');
const snowflake = require('snowflake-sdk');
const axios = require('axios');
const uuid = require('uuid');

const {
	ALREADY_CONNECTED_STATUS,
	DEFAULT_CLIENT_APP_ID,
	DEFAULT_CLIENT_APP_VERSION,
	DEFAULT_WAREHOUSE,
	DEFAULT_ROLE,
	HACKOLADE_APPLICATION,
} = require('./constants.js');
const { getAccountName, getRole } = require('../common.js');
const errorMessages = require('../errorMessages.js');

const authByOkta = async ({
	account,
	accessUrl,
	username,
	password,
	authenticator,
	role,
	timeout,
	connectWithTimeout,
	logger,
	warehouse = DEFAULT_WAREHOUSE,
}) => {
	const oktaCredentialsError = { message: errorMessages.OKTA_CREDENTIALS_ERROR };

	logger.log('info', `Authenticator: ${authenticator}`, 'Connection');
	const accountName = getAccountName(account);
	const ssoUrlsData = await axios.post(
		`${accessUrl}/session/authenticator-request?Application=${HACKOLADE_APPLICATION}`,
		{
			data: {
				ACCOUNT_NAME: accountName,
				LOGIN_NAME: username,
				AUTHENTICATOR: getOktaAuthenticatorUrl(authenticator),
			},
		},
	);

	logger.log('info', `Starting Okta connection...`, 'Connection');
	const tokenUrl = _.get(ssoUrlsData, 'data.data.tokenUrl', '');
	const authNUrl = tokenUrl.replace(/api\/v1\/.*/, 'api/v1/authn');
	const ssoUrl = _.get(ssoUrlsData, 'data.data.ssoUrl', '');
	logger.log('info', `Token URL: ${tokenUrl}\nSSO URL: ${ssoUrl}`, 'Connection');

	if (!tokenUrl || !ssoUrl) {
		return Promise.reject({ message: errorMessages.OKTA_SSO_ERROR });
	}

	const authNData = await axios
		.post(authNUrl, {
			username,
			password,
			options: {
				multiOptionalFactorEnroll: false,
				warnBeforePasswordExpired: false,
			},
		})
		.catch(err => ({}));
	const status = _.get(authNData, 'data.status', 'SUCCESS');
	const authToken = _.get(authNData, 'data.sessionToken', '');
	if (status.startsWith('MFA')) {
		return Promise.reject({ message: errorMessages.OKTA_MFA_ERROR });
	}

	const identityProviderTokenData = await axios.post(tokenUrl, { username, password }).catch(err => {
		return authToken ? {} : Promise.reject(oktaCredentialsError);
	});

	logger.log('info', `Successfully connected to Okta`, 'Connection');
	const identityProviderToken = _.get(identityProviderTokenData, 'data.cookieToken', '') || authToken;
	if (!identityProviderToken) {
		return Promise.reject(oktaCredentialsError);
	}

	logger.log('info', `One-time IDP token has been provided`, 'Connection');

	const samlUrl = `${ssoUrl}?onetimetoken=${encodeURIComponent(identityProviderToken)}&RelayState=${encodeURIComponent('/some/deep/link')}`;
	const samlResponseData = await axios.get(samlUrl, { headers: { HTTP_HEADER_ACCEPT: '*/*' } });
	const rawSamlResponse = _.get(samlResponseData, 'data', '');

	if (!rawSamlResponse) {
		logger.log('info', `Warning: RAW_SAML_RESPONSE is empty`, 'Connection');
	} else {
		logger.log('info', `RAW_SAML_RESPONSE has been provided`, 'Connection');
	}

	const requestId = uuid.v4();
	let authUrl = `${accessUrl}/session/v1/login-request?request_id=${encodeURIComponent(requestId)}&Application=${HACKOLADE_APPLICATION}`;
	role = role || DEFAULT_ROLE;

	authUrl += `&roleName=${encodeURIComponent(getRole(role))}`;
	authUrl += `&warehouse=${encodeURIComponent(warehouse)}`;

	const authData = await axios.post(authUrl, {
		data: {
			CLIENT_APP_ID: DEFAULT_CLIENT_APP_ID,
			CLIENT_APP_VERSION: DEFAULT_CLIENT_APP_VERSION,
			RAW_SAML_RESPONSE: rawSamlResponse,
			LOGIN_NAME: username,
			ACCOUNT_NAME: accountName,
			CLIENT_ENVIRONMENT: {
				APPLICATION: HACKOLADE_APPLICATION,
			},
		},
	});
	let tokensData = authData.data;
	if (_.isString(tokensData)) {
		try {
			tokensData = JSON.parse(tokensData);
		} catch (err) {
			logger.log('error', 'Failed parsing of tokens', 'Connection');
		}
	}
	if (!tokensData.success) {
		return Promise.reject(tokensData.message);
	}
	const masterToken = _.get(tokensData, 'data.masterToken', '');
	const sessionToken = _.get(tokensData, 'data.token', '');
	logger.log('info', `Tokens have been provided`, 'Connection');

	return connectWithTimeout(
		{
			accessUrl,
			masterToken,
			sessionToken,
			account,
			username,
			password,
			role,
			warehouse,
			timeout,
			host: '',
		},
		error => error.code === ALREADY_CONNECTED_STATUS,
	);
};

const getOktaAuthenticatorUrl = (authenticator = '') => {
	if (/^http(s)?/im.test(authenticator)) {
		return authenticator;
	}

	if (/\.okta\.com\/?$/.test(authenticator)) {
		return `https://${authenticator}`;
	}

	return `https://${authenticator}.okta.com`;
};

module.exports = {
	authByOkta,
};
