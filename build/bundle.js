module.exports =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

	var Webtask = __webpack_require__(1);

	// This is the entry-point for the Webpack build. We need to convert our module
	// (which is a simple Express server) into a Webtask-compatible function.
	module.exports = Webtask.fromExpress(__webpack_require__(2));


/***/ }),
/* 1 */
/***/ (function(module, exports) {

	module.exports = require("webtask-tools");

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

	var express = __webpack_require__(3);
	var app = express();
	var memoizer = __webpack_require__(4);
	var Request = __webpack_require__(5);
	var syncWithMailChimp = __webpack_require__(6);
	var metadata = __webpack_require__(15);

	function job (req, res) {

	  var ctx = req.webtaskContext;

	  var required_settings = [
	    'AUTH0_DOMAIN',
	    'AUTH0_CLIENT_ID',
	    'AUTH0_CLIENT_SECRET',
	    'MAILCHIMP_API_KEY',
	    'MAILCHIMP_LIST_NAME',
	    'AUTH0_CONNECTION_NAME'
	  ];

	  var missing_settings = required_settings.filter(function (setting) {
	    return !ctx.data[setting];
	  });

	  if (missing_settings.length) {
	    return res.status(400).send({message: 'Missing settings: ' + missing_settings.join(', ')});
	  }

	  var config = {
	    TENANT_DOMAIN: req.webtaskContext.data.AUTH0_DOMAIN,
	    USER_SEARCH_MGMT_TOKEN: req.access_token,
	    MAILCHIMP_API_KEY: ctx.data.MAILCHIMP_API_KEY,
	    MAILCHIMP_LIST_NAME: ctx.data.MAILCHIMP_LIST_NAME,
	    AUTH0_CONNECTION_NAME: ctx.data.AUTH0_CONNECTION_NAME,
	  };

	  requestMailChimpSync(config, function (err) {
	    if (err) {
	      return res.sendStatus(500).send('Error - please see logs for details');
	    }
	    return res.status(200).send('All done!');
	  });
	}

	function requestMailChimpSync (config, cb) {
	  syncWithMailChimp(config).then(function () {
	    return cb();
	  }, function (err) {
	    return cb(err);
	  } );
	}

	var getTokenCached = memoizer({
	  load: function (apiUrl, audience, clientId, clientSecret, cb) {
	    Request
	      .post(apiUrl)
	      .send({
	        audience: audience,
	        grant_type: 'client_credentials',
	        client_id: clientId,
	        client_secret: clientSecret
	      })
	      .type('application/json')
	      .end(function (err, res) {
	        if (err || !res.ok) {
	          cb(null, err);
	        } else {
	          cb(res.body.access_token);
	        }
	      });
	  },
	  hash: function (apiUrl) { return apiUrl },
	  max: 100,
	  maxAge: 1000 * 60 * 60
	});

	app.use(function (req, res, next) {
	  // Exclude /meta from authz
	  if (req.path === '/meta') {
	    return next();
	  }

	  var apiUrl       = 'https://' + req.webtaskContext.data.AUTH0_DOMAIN + '/oauth/token';
	  var audience     = 'https://' + req.webtaskContext.data.AUTH0_DOMAIN + '/api/v2/';

	  var clientId     = req.webtaskContext.data.AUTH0_CLIENT_ID;
	  var clientSecret = req.webtaskContext.data.AUTH0_CLIENT_SECRET;

	  getTokenCached(apiUrl, audience, clientId, clientSecret, function (access_token, err) {
	    if (err) {
	      console.error('Error getting access_token', err);
	      return next(err);
	    }

	    req.access_token = access_token;
	    // console.log(req.access_token);
	    next();
	  });
	});

	app.get ('/', job);
	app.post('/', job);

	app.get('/meta', function (req, res) {
	  res.status(200).send(metadata);
	});

	module.exports = app;


/***/ }),
/* 3 */
/***/ (function(module, exports) {

	module.exports = require("express");

/***/ }),
/* 4 */
/***/ (function(module, exports) {

	module.exports = require("lru-memoizer");

/***/ }),
/* 5 */
/***/ (function(module, exports) {

	module.exports = require("superagent");

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

	'use strict';

	var MailChimpAPI = __webpack_require__(7).MailChimpAPI;
	var async = __webpack_require__(8);
	var Q = __webpack_require__(9);

	var syncWithMailChimp = function (config) {
	  var MAILCHIMP_API_KEY = config.MAILCHIMP_API_KEY;
	  try {
	    var mailchimp = new MailChimpAPI(MAILCHIMP_API_KEY, {version: '2.0'});
	  } catch (error) {
	    return console.log(error.message);
	  }
	  var _getAuth0Users = __webpack_require__(10)(config);
	  var _getMailChimpListMatchingName = __webpack_require__(13)(config, mailchimp);
	  var _mergeAuth0UsersIntoMailChimp = __webpack_require__(14)(config, mailchimp);

	  var deferred = Q.defer();

	  async.waterfall([
	      _getAuth0Users,
	      _getMailChimpListMatchingName,
	      _mergeAuth0UsersIntoMailChimp
	    ],
	    function (err) {
	      if (err) {
	        console.error(err);
	        return deferred.reject(new Error(err));
	      }
	      return deferred.resolve();
	    }
	  );
	  return deferred.promise;
	};

	module.exports = syncWithMailChimp;


/***/ }),
/* 7 */
/***/ (function(module, exports) {

	module.exports = require("mailchimp");

/***/ }),
/* 8 */
/***/ (function(module, exports) {

	module.exports = require("async");

/***/ }),
/* 9 */
/***/ (function(module, exports) {

	module.exports = require("q");

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

	'use strict';

	var request = __webpack_require__(11);
	var R = __webpack_require__(12);
	var Q = __webpack_require__(9);


	var getUsers = function (config, allUsers, perPage, pageNumber) {

	  var TENANT_DOMAIN = config.TENANT_DOMAIN;
	  var USER_SEARCH_MGMT_TOKEN = config.USER_SEARCH_MGMT_TOKEN;
	  var AUTH0_CONNECTION_NAME = config.AUTH0_CONNECTION_NAME;

	  var deferred = Q.defer();
	  var searchCriteria = { q: 'identities.connection:"' + AUTH0_CONNECTION_NAME + '"', search_engine: 'v2', per_page: perPage, page: pageNumber, fields: 'email,user_metadata', include_fields: 'true' };

	  var options = {
	    method: 'GET',
	    url: 'https://' + TENANT_DOMAIN + '/api/v2/users',
	    qs: searchCriteria,
	    headers: {
	      'cache-control': 'no-cache',
	      authorization: 'Bearer ' + USER_SEARCH_MGMT_TOKEN
	    }
	  };
	  request(options, function (error, response, body) {
	    if (error) {
	      return deferred.reject(new Error(error));
	    }
	    var newUsers = JSON.parse(body);
	    if (newUsers.length > 0) {
	      allUsers = R.concat(allUsers, newUsers);
	      return deferred.resolve(getUsers(config, allUsers, perPage, pageNumber + 1));
	    }
	    return deferred.resolve(allUsers);
	  });
	  return deferred.promise;
	};

	var getAuth0Users = function (config) {
	  return function (callback) {
	    getUsers(config, [], 20, 0).then(function (users) {
	      var totalUsers = users.length;
	      console.log('Total number of Auth0 users: ' + totalUsers);
	      return callback(null, users);
	    }, function (err) {
	      console.error('ERROR: ' + err);
	      callback(err);
	    });
	  };
	};

	module.exports = getAuth0Users;


/***/ }),
/* 11 */
/***/ (function(module, exports) {

	module.exports = require("request");

/***/ }),
/* 12 */
/***/ (function(module, exports) {

	module.exports = require("ramda");

/***/ }),
/* 13 */
/***/ (function(module, exports) {

	'use strict';

	var getMailChimpListMatchingName = function (config, mailchimp) {
	  var MAILCHIMP_LIST_NAME = config.MAILCHIMP_LIST_NAME;
	  return function (users, callback) {
	    mailchimp.lists_list({
	        filters: {
	          list_name: MAILCHIMP_LIST_NAME
	        }
	      }, function (err, result) {
	        if (err) {
	          console.error(err);
	          return callback(err);
	        }
	        var list = result.data[0];
	        var mailChimpListId = list.id;
	        console.log('MailChimp list id: ' + mailChimpListId);
	        var mailChimpListName = list.name;
	        console.log('MailChimp list name: ' + mailChimpListName);
	        return callback(null, {mailChimpList: list, auth0Users: users});
	      });
	  };
	};

	module.exports = getMailChimpListMatchingName;


/***/ }),
/* 14 */
/***/ (function(module, exports) {

	'use strict';

	var mergeAuth0UsersIntoMailChimp = function (config, mailchimp) {
	  return function (context, callback) {
	    // Upload users (add new or update existing ones)

	    var listId = context.mailChimpList.id;
	    var users = context.auth0Users;

	    mailchimp.lists_batch_subscribe({
	      id: listId,
	      batch: users.map(function (user) {
	        return {
	          email: {
	            email: user.email
	          },
	          email_type: 'text',
	          merge_vars: {
	            'FNAME': user.given_name || user.user_metadata.firstName || '',
	            'LNAME': user.family_name || user.user_metadata.lastName  || '',
	            LANG: user.user_metadata.lang || 'en',
	          }
	        };
	      }),
	      double_optin: false,
	      update_existing: true,
	      replace_interests: true
	    }, function (err, res) {
	      if (err) {
	        console.error(err);
	        return callback(err);
	      }
	      console.log('Batch List update completed successfully');
	      return callback(null, context)
	    });
	  };
	};

	module.exports = mergeAuth0UsersIntoMailChimp;


/***/ }),
/* 15 */
/***/ (function(module, exports) {

	module.exports = {"codeUrl":"https://github.com/auth0/auth0-mailchimp-export","title":"Auth0 MailChimp Export","name":"auth0-mailchimp-export","version":"1.0.0","author":"auth0","description":"Allows Auth0 Customers to synchronize their Auth0 User base (those that have an email) with a MailChimp List","type":"cron","repository":"https://github.com/auth0/auth0-mailchimp-export","keywords":["auth0","mailchimp","user profile"],"schedule":"0 */5 * * * *","secrets":{"AUTH0_DOMAIN":{"description":"This is the Auth0 Domain","required":true},"AUTH0_CLIENT_ID":{"description":"This is the Client ID","required":true},"AUTH0_CLIENT_SECRET":{"description":"This is the Client Secret","required":true},"MAILCHIMP_API_KEY":{"description":"This is the MailChimp API Key associated with your MailChimp user account. eg. f1b0602xy124d85d8444a5d4e5eed-us14","required":true},"MAILCHIMP_LIST_NAME":{"description":"This is the name of the MailChimp List you wish to export Auth0 User Profiles to. eg. Auth0-DBConn1","required":true},"AUTH0_CONNECTION_NAME":{"description":"This is the Auth0 Connection name associated with the user profiles you wish to export","required":true}}}

/***/ })
/******/ ]);