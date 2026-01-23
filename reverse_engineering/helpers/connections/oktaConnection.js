const _ = require('lodash');
const { hckFetch } = require('@hackolade/fetch');
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
const errorMessages = require('../../../common/errorMessages.js');

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
	const ssoUrlsResponse = await hckFetch(
		`${accessUrl}/session/authenticator-request?Application=${HACKOLADE_APPLICATION}`,
		{
			method: 'POST',
			body: JSON.stringify({
				data: {
					ACCOUNT_NAME: accountName,
					LOGIN_NAME: username,
					AUTHENTICATOR: getOktaAuthenticatorUrl(authenticator),
				},
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		},
	);
	const ssoUrlsData = await ssoUrlsResponse.json();

	logger.log('info', `Starting Okta connection...`, 'Connection');
	const tokenUrl = _.get(ssoUrlsData, 'data.tokenUrl', '');
	const authNUrl = tokenUrl.replace(/api\/v1\/.*/, 'api/v1/authn');
	const ssoUrl = _.get(ssoUrlsData, 'data.ssoUrl', '');
	logger.log('info', `Token URL: ${tokenUrl}\nSSO URL: ${ssoUrl}`, 'Connection');

	if (!tokenUrl || !ssoUrl) {
		return Promise.reject({ message: errorMessages.OKTA_SSO_ERROR });
	}

	const authNData = await hckFetch(authNUrl, {
		method: 'POST',
		body: JSON.stringify({
			username,
			password,
			options: {
				multiOptionalFactorEnroll: false,
				warnBeforePasswordExpired: false,
			},
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	})
		.then(res => (res.ok ? res.json() : {}))
		.catch(err => ({}));
	const status = _.get(authNData, 'status', 'SUCCESS');
	const authToken = _.get(authNData, 'sessionToken', '');
	if (status.startsWith('MFA')) {
		return Promise.reject({ message: errorMessages.OKTA_MFA_ERROR });
	}

	const identityProviderTokenData = await hckFetch(tokenUrl, {
		method: 'POST',
		body: JSON.stringify({ username, password }),
		headers: {
			'Content-Type': 'application/json',
		},
	})
		.then(res => (res.ok ? res.json() : Promise.reject()))
		.catch(err => (authToken ? {} : Promise.reject(oktaCredentialsError)));

	logger.log('info', `Successfully connected to Okta`, 'Connection');
	const identityProviderToken = _.get(identityProviderTokenData, 'cookieToken', '') || authToken;
	if (!identityProviderToken) {
		return Promise.reject(oktaCredentialsError);
	}

	logger.log('info', `One-time IDP token has been provided`, 'Connection');

	const samlUrl = `${ssoUrl}?onetimetoken=${encodeURIComponent(identityProviderToken)}&RelayState=${encodeURIComponent('/some/deep/link')}`;
	const samlResponse = await hckFetch(samlUrl, {
		method: 'GET',
		headers: {
			Accept: '*/*',
		},
	});
	const rawSamlResponse = samlResponse.ok ? await samlResponse.text() : '';

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

	const authResponse = await hckFetch(authUrl, {
		method: 'POST',
		body: JSON.stringify({
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
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	let tokensData = await authResponse.json();
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
