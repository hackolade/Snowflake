module.exports = {
	CONNECTION_ERROR: 'Connection error',
	OKTA_SSO_ERROR: "Can't get SSO URL. Please, check the authenticator",
	OKTA_CREDENTIALS_ERROR:
		'Incorrect Okta username/password or MFA is enabled. Please, check credentials or use the "Identity Provider SSO (via external browser)" for MFA auth',
	OKTA_MFA_ERROR:
		'Native Okta auth doesn\'t support MFA. Please, use the "Identity Provider SSO (via external browser)" auth instead',
};
