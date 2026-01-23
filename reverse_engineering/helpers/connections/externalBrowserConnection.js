const _ = require('lodash');
const { hckFetch } = require('@hackolade/fetch');
const uuid = require('uuid');

const {
	DEFAULT_WAREHOUSE,
	HACKOLADE_APPLICATION,
	DEFAULT_ROLE,
	DEFAULT_CLIENT_APP_ID,
	DEFAULT_CLIENT_APP_VERSION,
	ALREADY_CONNECTED_STATUS,
} = require('./constants');

const { getAccountName, getRole, removeQuotes } = require('../common');
const { connectWithTimeout, execute } = require('./connection');
const errorMessages = require('common/errorMessages');

const authByExternalBrowser = async ({
	token,
	accessUrl,
	proofKey,
	username,
	account,
	role,
	timeout,
	logger,
	warehouse = DEFAULT_WAREHOUSE,
}) => {
	const accountName = getAccountName(account);
	warehouse = _.trim(warehouse);
	role = _.trim(role);

	const requestId = uuid.v4();
	let authUrl = `${accessUrl}/session/v1/login-request?request_id=${encodeURIComponent(requestId)}&Application=${HACKOLADE_APPLICATION}`;
	role = role || DEFAULT_ROLE;
	authUrl += `&roleName=${encodeURIComponent(getRole(role))}`;

	const authData = await hckFetch(authUrl, {
		method: 'POST',
		body: JSON.stringify({
			data: {
				CLIENT_APP_ID: DEFAULT_CLIENT_APP_ID,
				CLIENT_APP_VERSION: DEFAULT_CLIENT_APP_VERSION,
				TOKEN: token,
				AUTHENTICATOR: 'EXTERNALBROWSER',
				PROOF_KEY: proofKey,
				LOGIN_NAME: username,
				ACCOUNT_NAME: accountName,
				CLIENT_ENVIRONMENT: {
					APPLICATION: HACKOLADE_APPLICATION,
				},
			},
		}),
		headers: {
			Accept: 'application/json',
			Authorization: 'Basic',
			'Content-Type': 'application/json',
		},
	});

	if (!authData.ok) {
		return Promise.reject(
			new Error(errorMessages.EXTERNAL_BROWSER_ERROR + ` Status ${authData.status} ${authData.statusText}`),
		);
	}

	let tokensData = await authData.json();
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

	await connectWithTimeout(
		{
			accessUrl,
			masterToken,
			sessionToken,
			account,
			username,
			role,
			warehouse,
			password: 'password',
			timeout,
			host: '',
		},
		error => error.code === ALREADY_CONNECTED_STATUS,
	);

	return new Promise((resolve, reject) => {
		execute(`USE WAREHOUSE "${removeQuotes(warehouse)}";`).then(resolve, async err => {
			logger.log('error', err.message, 'Connection');
			await execute(`USE ROLE "${role}"`).catch(err => {});
			let userData = await execute(`DESC USER "${username}"`).catch(err => []);
			userData = userData.filter(data => data.property !== 'PASSWORD');
			logger.log('info', `User info: ${JSON.stringify(userData)}`, 'Connection');
			let warehouses = await execute(`SHOW WAREHOUSES;`).catch(err => {
				logger.log('error', err.message, 'Connection');
				return [];
			});
			const roles = await execute(`SHOW ROLES;`).catch(err => {
				logger.log('error', err.message, 'Connection');
				return [];
			});
			const roleNames = roles.map(role => role.name);
			const defaultRoleData = userData.find(data => _.toUpper(_.get(data, 'property')) === 'DEFAULT_ROLE');
			if (_.isEmpty(warehouses)) {
				const userRole = _.get(defaultRoleData, 'value', '');
				if (userRole !== 'null') {
					await execute(`USE ROLE "${userRole}"`).catch(err => {});
				}
				warehouses = await execute(`SHOW WAREHOUSES;`).catch(err => {
					logger.log('error', err.message, 'Connection');
					return [];
				});
				if (_.isEmpty(warehouses)) {
					reject('Warehouse is not available. Please check your role and warehouse');
				}
			}
			const names = warehouses.map(wh => wh.name);

			const defaultWarehouseData = userData.find(
				data => _.toUpper(_.get(data, 'property')) === 'DEFAULT_WAREHOUSE',
			);
			const defaultUserWarehouse = _.get(defaultWarehouseData, 'value', '');
			const defaultWarehouse = names.includes(defaultUserWarehouse) ? defaultUserWarehouse : _.first(names);

			logger.log(
				'info',
				`Available warehouses: ${names.join()}; Available roles: ${roleNames.join()}`,
				'Connection',
			);
			logger.log('info', `Fallback to ${defaultWarehouse} warehouse`, 'Connection');

			const logError = err => logger.log('info', `WAREHOUSE error: ${err}`, 'Connection');

			const logAndReturnEmptyArray = err => {
				logError(err);
				return [];
			};

			execute(`USE WAREHOUSE "${removeQuotes(defaultWarehouse)}";`).then(resolve, async err => {
				if (err) {
					logError(err);
				}

				const currentInfo = await execute(
					`select current_warehouse() as warehouse, current_role() as role;`,
				).catch(logAndReturnEmptyArray);

				const infoRow = _.first(currentInfo);
				const currentWarehouse = _.get(infoRow, 'WAREHOUSE', '');
				const currentRole = _.get(infoRow, 'ROLE', '');
				logger.log(
					'info',
					`Current warehouse: ${currentWarehouse}\n Current role: ${currentRole}`,
					'Connection',
				);
				resolve();
			});
		});
	});
};

module.exports = {
	authByExternalBrowser,
};
